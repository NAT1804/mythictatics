# Deploy Mythic Tatics lên Cloudflare

Hướng dẫn đưa `apps/web` lên Cloudflare Workers, từ lần deploy đầu tiên đến deploy tự động qua
CI, gắn domain, cache và rollback. Repo đã cấu hình sẵn gần hết; phần lớn việc còn lại là tạo
token và bật một biến.

## 1. Kiến trúc

```
Trình duyệt ──► Cloudflare edge
                 ├─ Static Assets (dist/apps/web/browser)   ← miễn phí, không giới hạn
                 │    /, /builder, /collection, /comps, /comps/<slug>,
                 │    JS/CSS, ảnh, data/canonical/*.json
                 └─ Worker (dist/apps/web/server/server.mjs) ← tính vào quota
                      chỉ khi không có file tĩnh nào khớp: hiện là trang 404
```

- `apps/web/wrangler.jsonc` khai báo Worker `mythictatics-web`. Worker chạy bundle SSR Angular,
  build với `ssr.platform: "neutral"` để chạy trên workerd, không phải Node.
- Mọi route đều được **prerender** lúc build (xem `apps/web/src/app/app.routes.server.ts`):
  - `/`, `/comps` và mỗi `/comps/<slug>` được render đầy đủ nội dung.
  - `/builder` và `/collection` được render ở trạng thái "Loading…". Trình duyệt tự vẽ phần còn lại
    từ query string.
- Static Assets được phục vụ **trước** Worker (`not_found_handling: "none"`, không bật
  `run_worker_first`). Vì vậy truy cập thông thường không tốn một lần gọi Worker nào.

Hệ quả: gói Free (100.000 lần gọi Worker/ngày, 10 ms CPU mỗi lần) là quá đủ, vì Worker gần như
chỉ chạy cho URL sai.

## 2. Yêu cầu

| Thứ cần có                        | Ghi chú                                                       |
| --------------------------------- | ------------------------------------------------------------- |
| Tài khoản Cloudflare              | Gói Free là đủ                                                |
| Node `^22.22.3` hoặc `^24.15.0`   | CI dùng Node 24                                               |
| `npm ci` đã chạy                  | `wrangler` nằm trong devDependencies, gọi bằng `npx wrangler` |
| (Tuỳ chọn) domain trên Cloudflare | Chỉ cần khi gắn `mythictatics.com`                            |

## 3. Kiểm tra cục bộ trên Workers runtime

`nx serve` chạy dev server của Angular, không phải workerd. Trước khi deploy hãy chạy đúng
runtime sẽ lên production:

```sh
npx nx run web:cf-preview      # build production rồi chạy `wrangler dev` ở http://localhost:8787
```

Và bộ e2e (chạy trên chính `cf-preview`):

```sh
npm run e2e:install            # chỉ lần đầu, nếu không Playwright báo "Executable doesn't exist"
npx nx e2e web-e2e
```

Để xem các trang prerender có đúng nội dung không, kiểm tra thẳng file sinh ra:

```sh
npx nx build web
grep -o '<title>[^<]*' dist/apps/web/browser/comps/*/index.html | head
```

## 4. Deploy thủ công lần đầu

```sh
npx wrangler login             # mở trình duyệt để cấp quyền cho wrangler
npx nx deploy web              # = nx build web + wrangler deploy --config apps/web/wrangler.jsonc
```

Lần đầu, Wrangler có thể hỏi để đăng ký subdomain `*.workers.dev` cho tài khoản. Xong sẽ in ra
URL dạng `https://mythictatics-web.<subdomain>.workers.dev`.

`security.allowedHosts` trong `apps/web/project.json` đã có `*.workers.dev`, nên URL này chạy được
ngay. Angular từ chối render cho host không có trong danh sách.

## 5. Deploy tự động qua GitHub Actions (khuyên dùng)

`.github/workflows/ci.yml` đã có job `deploy`. Job này chạy khi **push lên `main`**, chỉ sau khi
job `main` (format, lint, typecheck, test, build, e2e) pass, và chỉ deploy khi được bật bằng biến
`CLOUDFLARE_DEPLOY`. Ở run của PR, job `deploy` luôn hiện _skipped_: đó là hành vi đúng.

### 5.1 Tạo API token

1. Cloudflare dashboard → **My Profile → API Tokens → Create Token**.
2. Chọn template **Edit Cloudflare Workers**.
3. Ở _Account Resources_, giới hạn token vào đúng tài khoản. Ở _Zone Resources_, chọn zone của
   domain nếu sẽ gắn custom domain (mục 6), hoặc _All zones_ của tài khoản đó.
4. Tạo và copy token (chỉ hiện một lần).

**Account ID** nằm ở trang _Workers & Pages → Overview_, cột bên phải.

### 5.2 Khai báo trên GitHub

Job `deploy` khai báo `environment: CLOUDFLARE_ENVIRONMENT`. Repo → **Settings → Environments →
CLOUDFLARE_ENVIRONMENT** (tạo nếu chưa có), rồi thêm:

| Loại     | Tên                     | Giá trị       |
| -------- | ----------------------- | ------------- |
| Secret   | `CLOUDFLARE_API_TOKEN`  | token vừa tạo |
| Secret   | `CLOUDFLARE_ACCOUNT_ID` | Account ID    |
| Variable | `CLOUDFLARE_DEPLOY`     | `true`        |

`if` ở cấp job không đọc được biến của environment, nên `CLOUDFLARE_DEPLOY` được kiểm tra ở từng
step. Khi biến không phải `true`, job vẫn chạy nhưng chỉ in notice _Deploy skipped_ rồi kết thúc.

Nếu muốn bắt buộc duyệt tay trước khi deploy, thêm _Required reviewers_ cho environment này.

### 5.3 Luồng làm việc

```
PR ──► CI (lint, typecheck, test, build, e2e) ──► merge vào main ──► CI ──► deploy
```

Không cần làm gì thêm: merge là deploy.

### Vì sao không dùng Workers Builds

Cloudflare có thể tự build khi có push lên Git (_Workers Builds_). Không nên bật cho repo này: nó
sẽ deploy **song song** với GitHub Actions và bỏ qua bước chặn bằng test và e2e. Chỉ giữ một
đường deploy.

## 6. Gắn domain riêng

Điều kiện: domain (`mythictatics.com`) đã được thêm vào Cloudflare làm zone.

Thêm `routes` vào `apps/web/wrangler.jsonc`:

```jsonc
{
  // ...
  "routes": [
    { "pattern": "mythictatics.com", "custom_domain": true },
    { "pattern": "www.mythictatics.com", "custom_domain": true },
  ],
}
```

Deploy lại. Cloudflare tự tạo bản ghi DNS và chứng chỉ TLS.

Cả hai host đã khớp với `allowedHosts` (`mythictatics.com`, `*.mythictatics.com`). Nếu gắn một
domain khác, **phải thêm nó vào `allowedHosts`**, nếu không Angular trả lỗi cho mọi trang render ở
Worker.

Nếu không muốn dùng URL `workers.dev` nữa, thêm `"workers_dev": false` vào `wrangler.jsonc`.

## 7. Tối ưu cache (nên làm)

Mặc định Static Assets trả `Cache-Control: public, max-age=0, must-revalidate`: mỗi lần tải trang,
trình duyệt lại hỏi server cho từng file. Với khoảng 400 ảnh (39 MB) thì đó là rất nhiều request
thừa.

Tạo file `apps/web/public/_headers`. Angular copy nó vào `dist/apps/web/browser`, và Cloudflare
áp dụng nó cho các response của Static Assets:

```
# JS/CSS do Angular build: tên file có hash, nội dung không bao giờ đổi.
/main-*
  Cache-Control: public, max-age=31536000, immutable
/chunk-*
  Cache-Control: public, max-age=31536000, immutable
/styles-*
  Cache-Control: public, max-age=31536000, immutable
/polyfills-*
  Cache-Control: public, max-age=31536000, immutable

# Ảnh card: tên không có hash, chỉ đổi khi game đổi art.
/images/*
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800

# Dataset: đổi sau mỗi patch game, và nên khớp với HTML vừa deploy.
/data/*
  Cache-Control: public, max-age=300, stale-while-revalidate=3600
```

Không đặt cache dài cho HTML. Các trang prerender tham chiếu JS theo tên có hash, nên HTML phải
luôn là bản mới nhất; mặc định `must-revalidate` với ETag đã đúng.

Kiểm tra sau khi deploy:

```sh
curl -sI https://mythictatics.com/images/<một-file>.png | grep -i cache-control
```

## 8. Preview URL cho mỗi PR (tuỳ chọn)

`wrangler versions upload` tải một phiên bản lên mà **không** đưa nó ra production, và trả về URL
riêng để xem thử. Thêm job này dưới `jobs:` trong `ci.yml`, ngang hàng với `main` và `deploy`:

```yaml
preview:
  if: github.event_name == 'pull_request'
  needs: main
  runs-on: ubuntu-latest
  environment: CLOUDFLARE_ENVIRONMENT # nơi giữ secrets, xem mục 5.2
  steps:
    - uses: actions/checkout@v5

    - uses: actions/setup-node@v5
      with:
        node-version: 24
        cache: 'npm'

    - run: npm ci
    - run: npx nx build web
    - run: >
        npx wrangler versions upload --config apps/web/wrangler.jsonc
        --preview-alias pr-${{ github.event.pull_request.number }}
        --message "PR #${{ github.event.pull_request.number }}"
      env:
        CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

URL có dạng `https://pr-<số>-mythictatics-web.<subdomain>.workers.dev` và giữ nguyên qua các lần
push vào cùng PR. Lưu ý:

- PR mở từ **fork** không được đọc secrets, nên job này sẽ thất bại với PR từ fork.
- Nếu environment `CLOUDFLARE_ENVIRONMENT` giới hạn branch được deploy (_Deployment branches_),
  job này sẽ bị chặn với branch của PR.
- Job không kiểm tra `CLOUDFLARE_DEPLOY`: `if` ở cấp job không đọc được biến của environment. Nếu
  cần công tắc, kiểm tra nó ở từng step như job `deploy`.
- Preview URL cần `preview_urls` đang bật (mặc định bật khi có `workers.dev`).
- Host của preview vẫn là `*.workers.dev`, đã có trong `allowedHosts`. Hãy mở thử một URL 404 trên
  preview để chắc Worker render được.

## 9. Kiểm tra sau khi deploy

1. Mở `/`, `/comps`, một `/comps/<slug>`, `/builder?d=ASEEiRMCOTAB` và `/collection?realm=kami`.
2. Xác nhận các trang prerender **không** chạy Worker: chạy `wrangler tail` rồi mở các trang trên.
   Không được có dòng log nào; chỉ URL sai (ví dụ `/khong-ton-tai`) mới hiện log.

   ```sh
   npx wrangler tail --config apps/web/wrangler.jsonc
   ```

3. URL sai phải trả **404**: `curl -sI https://mythictatics.com/khong-ton-tai | head -1`.
4. Trên dashboard (**Workers & Pages → mythictatics-web → Metrics/Logs**), số lần gọi Worker phải
   rất thấp so với lượng truy cập. `observability.enabled` đã bật sẵn trong `wrangler.jsonc`.

## 10. Rollback

Mỗi lần deploy là một _version_. Quay lại bản trước:

```sh
npx wrangler deployments list --config apps/web/wrangler.jsonc   # xem lịch sử
npx wrangler rollback --config apps/web/wrangler.jsonc           # về bản trước đó
npx wrangler rollback <version-id> --config apps/web/wrangler.jsonc
```

Rollback có hiệu lực ngay, không cần build lại. Sau đó sửa lỗi trên `main`; lần deploy kế tiếp sẽ
đè lên bản đã rollback.

## 11. Giới hạn cần để ý

| Giới hạn (gói Free)         | Hiện tại                                | Ghi chú                                                                                         |
| --------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Worker bundle ≤ 3 MB (gzip) | khoảng 950 KB                           | Angular nhúng một bản copy của mọi trang prerender vào bundle, nên con số này tăng theo số comp |
| ≤ 20.000 file static        | khoảng 450                              |                                                                                                 |
| ≤ 25 MiB mỗi file           | file lớn nhất là `cards.json` (~600 KB) |                                                                                                 |
| 100.000 lần gọi Worker/ngày | gần như chỉ trang 404                   | Static Assets không tính                                                                        |
| 10 ms CPU mỗi lần gọi       | trang 404 không nạp dataset             | Đừng cho trang render ở Worker nạp `cards.json`                                                 |

Xem kích thước bundle trước khi deploy:

```sh
npx nx build web && tar czf - -C dist/apps/web server | wc -c
```

## 12. Sau mỗi thay đổi dữ liệu

- **Patch game** (chạy lại `tools/client/extract_cards.py`) hoặc **import comp mới**
  (`python3 tools/comps/import_sheet.py`): commit rồi merge vào `main`. Build sẽ prerender lại mọi
  trang, kể cả trang cho comp mới.
- Slug chưa có lúc build vẫn mở được: trình duyệt hiện "No comp by that name". Trang mới chỉ xuất
  hiện sau lần build kế tiếp.

## 13. Xử lý sự cố

| Triệu chứng                                                | Nguyên nhân thường gặp                                  | Cách xử lý                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| CI báo `Authentication error [code: 10000]`                | Token thiếu quyền hoặc sai Account ID                   | Tạo lại token từ template _Edit Cloudflare Workers_, kiểm tra `CLOUDFLARE_ACCOUNT_ID`                         |
| Job `deploy` bị bỏ qua (skipped)                           | Run của PR, không phải push lên `main`                  | Bình thường: job chỉ chạy sau khi merge vào `main`                                                            |
| Job `deploy` in notice _Deploy skipped_                    | `CLOUDFLARE_DEPLOY` không phải `true` trong environment | Xem mục 5.2                                                                                                   |
| Domain mới trả lỗi ở trang 404                             | Host không có trong `allowedHosts`                      | Thêm vào `apps/web/project.json`, deploy lại                                                                  |
| Trang comp trống hoặc báo "could not be loaded" trong HTML | Prerender không đọc được `data/canonical/`              | Kiểm tra glob `data/canonical` trong `assets` của `apps/web/project.json`; chạy `npx nx build web` và đọc log |
| Trang nhấp nháy sau khi tải                                | Hydration không khớp: trình duyệt vẽ lại trang          | Chạy `npx nx e2e web-e2e`; test _keeps the server's markup_ sẽ fail và chỉ ra trang nào                       |
| `Your Worker exceeded the size limit`                      | Bundle vượt 3 MB                                        | Xem mục 11; cân nhắc gói Paid (10 MB)                                                                         |
| Playwright: `Executable doesn't exist`                     | Chưa cài trình duyệt                                    | `npm run e2e:install`                                                                                         |

## Tóm tắt nhanh

```sh
# Một lần
npx wrangler login
npx nx deploy web

# Từ đó về sau: đặt 2 secrets + CLOUDFLARE_DEPLOY=true trong environment
# CLOUDFLARE_ENVIRONMENT trên GitHub,
# rồi mọi lần merge vào main sẽ tự test và deploy.
```
