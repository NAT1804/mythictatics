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

| Thứ cần có                      | Ghi chú                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| Tài khoản Cloudflare            | Gói Free là đủ                                                |
| Node `^22.22.3` hoặc `^24.15.0` | CI dùng Node 24                                               |
| `npm ci` đã chạy                | `wrangler` nằm trong devDependencies, gọi bằng `npx wrangler` |
| Domain trên Cloudflare          | `mythictatics.click` — xem mục 6 để trỏ về Cloudflare         |

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

## 6. Trỏ domain `mythictatics.click` vào Cloudflare

Domain được mua ở registrar ngoài (không phải Cloudflare Registrar), nên cách trỏ là **đổi
nameserver về Cloudflare** — Cloudflare quản DNS toàn bộ zone, còn registrar chỉ giữ quyền sở hữu
domain. Làm theo đúng thứ tự dưới đây; `routes` trong `apps/web/wrangler.jsonc` đã khai báo sẵn
`mythictatics.click` và `www.mythictatics.click`, nhưng **deploy sẽ fail cho đến khi zone tồn tại
trên tài khoản Cloudflare** (bước 1).

### 6.1 Thêm zone vào Cloudflare

1. Cloudflare dashboard → **Add a domain** (hoặc **Websites → Add a site**).
2. Nhập `mythictatics.click`, chọn **Quick scan for DNS records** (kết quả scan không quan trọng —
   Worker custom domain sẽ tự tạo bản ghi riêng ở bước 6.3).
3. Chọn gói **Free**.
4. Cloudflare hiện ra **hai nameserver** dành riêng cho zone này, dạng
   `xxx.ns.cloudflare.com` / `yyy.ns.cloudflare.com`. Ghi lại cả hai.

### 6.2 Đổi nameserver ở registrar

Vào trang quản lý domain của nơi đã mua `mythictatics.click`, tìm mục **Nameservers** (thường
trong _DNS settings_ / _Domain management_):

1. Chuyển từ nameserver mặc định của registrar sang **Custom nameservers**.
2. Xoá các nameserver cũ, nhập đúng hai nameserver Cloudflare đưa ở bước 6.1.
3. Nếu registrar có **DNSSEC đang bật, tắt nó trước** khi đổi nameserver (bật lại sau qua
   Cloudflare → DNS → Settings nếu muốn), không thì zone không kích hoạt được.
4. Lưu. TLD `.click` thường cập nhật trong vài phút đến vài giờ (tối đa 24h).

Về lại Cloudflare bấm **Check nameservers now** (hoặc chờ mail). Khi zone chuyển trạng thái
**Active** thì mới sang bước tiếp theo. Kiểm tra nhanh:

```sh
dig NS mythictatics.click +short   # phải in ra 2 nameserver *.ns.cloudflare.com
```

### 6.3 Deploy để gắn Worker vào domain

`apps/web/wrangler.jsonc` đã có:

```jsonc
"routes": [
  { "pattern": "mythictatics.click", "custom_domain": true },
  { "pattern": "www.mythictatics.click", "custom_domain": true },
],
```

Chỉ cần deploy lại (merge vào `main`, hoặc `npx nx deploy web`). Với `custom_domain: true`,
Cloudflare **tự tạo bản ghi DNS và cấp chứng chỉ TLS** cho cả hai host — không phải tự thêm bản
ghi A/CNAME nào. Nếu bước quick scan lỡ tạo bản ghi trùng tên (`mythictatics.click` hoặc `www`),
xoá chúng đi trước khi deploy.

Lưu ý: API token của CI (mục 5.1) phải có quyền trên zone này (_Zone Resources_ → chọn
`mythictatics.click` hoặc _All zones_). Token tạo trước khi thêm zone với lựa chọn zone cụ thể sẽ
không thấy zone mới — tạo lại token nếu deploy báo lỗi quyền.

Nếu đã gắn domain bằng tay trên dashboard (_Workers & Pages → mythictatics-web → Settings →
Domains & Routes_), vẫn giữ `routes` trong `wrangler.jsonc`: deploy chỉ nhận lại domain đó cho
đúng Worker, và cấu hình trong repo là nguồn duy nhất. Domain gắn sẵn trước khi deploy bản mới vẫn
chạy **bản build cũ** — trang prerender tải được nhưng mọi URL Worker trả lời có thể lỗi 400 (xem
6.4).

### 6.4 Kiểm tra

Job `deploy` trong CI tự chạy bước **Smoke test mythictatics.click** sau `nx deploy web` và fail
nếu một trong các URL dưới đây không trả đúng mã (thử lại tối đa ~3 phút cho lần đầu cấp DNS/TLS):

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://mythictatics.click/              # 200
curl -s -o /dev/null -w '%{http_code}\n' https://www.mythictatics.click/          # 200
curl -s -o /dev/null -w '%{http_code}\n' https://mythictatics.click/sitemap.xml   # 200
curl -s -o /dev/null -w '%{http_code}\n' https://mythictatics.click/khong-ton-tai # 404, không phải 400
```

Chỉ kiểm tra trang chủ là không đủ: trang prerender được Static Assets trả thẳng, nên vẫn 200 kể
cả khi Worker từ chối host. `/sitemap.xml` và URL không tồn tại mới đi qua Worker; **400** ở đó
nghĩa là host không có trong `allowedHosts` (thường do bản đang chạy là bản build cũ).

Cả hai host đã khớp với `allowedHosts` trong `apps/web/project.json` (`mythictatics.click`,
`*.mythictatics.click`). Nếu sau này gắn một domain khác, **phải thêm nó vào `allowedHosts`**, nếu
không Angular trả lỗi cho mọi trang render ở Worker.

Nếu không muốn dùng URL `workers.dev` nữa, thêm `"workers_dev": false` vào `wrangler.jsonc` —
nhưng preview URL của PR (mục 8) cũng chạy trên `workers.dev`, nên chỉ tắt khi không dùng preview.

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
curl -sI https://mythictatics.click/images/<một-file>.png | grep -i cache-control
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

3. URL sai phải trả **404**: `curl -sI https://mythictatics.click/khong-ton-tai | head -1`.
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
