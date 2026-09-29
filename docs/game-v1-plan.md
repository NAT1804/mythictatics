# Kế hoạch V1 — Web game auto-battle (codename: Realmbound)

> Tài liệu tổng hợp các quyết định đã chốt (28/09/2026) cho việc phát triển repo này thành
> web game auto-battle độc lập: giữ engine + kiến trúc, thay toàn bộ art/text bằng asset riêng.
> Đọc cùng `CLAUDE.md` (các ràng buộc repo hiện hành vẫn áp dụng nguyên vẹn).

## 1. Các quyết định đã chốt

| Hạng mục | Quyết định | Lý do chính |
| --- | --- | --- |
| Hướng pháp lý | Tách thành game riêng: giữ engine/cơ chế, thay 100% art + text + tên | Cơ chế game không được bảo hộ bản quyền; asset thì có. Đây là hướng duy nhất thương mại hoá được |
| Art direction | **Vector toàn phần** (SVG/flat), thiết kế bằng Claude Design | Đồng nhất 120+ card bằng design system; PWA nhẹ (KB thay vì 40MB raster); sắc nét mọi DPI; animate trực tiếp; Anthropic trao quyền sở hữu output + có copyright indemnification cho khách trả phí |
| Renderer battle V1 | **Angular DOM + GSAP** (không PixiJS, không Phaser) | Tái dùng component card sẵn có; GSAP free 100% kể cả thương mại (từ khi về Webflow); đủ 60fps cho board nhỏ; SSR không phải né gì |
| Renderer battle V2 | PixiJS v8 dưới dạng island lazy-load, client-only — chỉ khi cần particles/shader | Engine ↔ renderer nói chuyện qua event log nên swap không đụng logic |
| Phaser | Không dùng | Full framework (loop/scene/physics/input) giành quyền điều khiển với Angular; thừa ~80% cho auto-battler |
| API framework | **Hono trên Cloudflare Workers** (thay plan NestJS cũ) | NestJS chạy kém trên Workers, sẽ ép thuê máy chủ Node riêng; Hono cùng mô hình fetch-based với `server.ts`; Zod contracts trong `libs/shared/contracts/schemas` dùng lại nguyên vẹn |
| PvP | **Async ghost battle trước**, realtime WebSocket sau | Không cần 2 người online cùng lúc; không WS, không disconnect handling; chi phí ~0 |
| Tên game | "Realmbound" là **codename tạm** | Phải kiểm tra trademark trước khi công bố |

## 2. Pháp lý & quy tắc asset

- **Tuyệt đối không dùng asset Mythic Tactics làm nguyên liệu**: không img2img, không train
  LoRA từ `apps/web/public/images/`, không prompt "in the style of Mythic Tactics".
  Tác phẩm phái sinh về pháp lý không khá hơn dùng thẳng art gốc.
- Chủ đề thần thoại là public domain (Zeus, Odin, Ra…) — cái được bảo hộ là *thiết kế nhân vật
  cụ thể* của từng game. Thiết kế của ta phải khác biệt rõ (tư thế, trang phục, bảng màu, bố cục card).
- Tên realm mới, không dùng lại tên của game gốc (Niles/Olympus/Yggdrasil/Shenzhou/Babylon/Kami/Daehan):
  xem design system (mục 7).
- Claude Design: điều khoản Anthropic chuyển quyền sở hữu output cho người dùng, cho phép thương mại
  không giới hạn doanh thu, kèm copyright indemnification (API/Claude for Work). Ảnh thuần AI không được
  bảo hộ bản quyền (thiếu human authorship) → lớp bảo hộ của ta là **trademark + code + phần chỉnh sửa
  của con người**, nên mọi asset đều qua vòng iterate/chỉnh tay và có hồ sơ nguồn gốc.
- **Hồ sơ nguồn gốc asset**: mỗi asset ghi lại tool, model, prompt/file nguồn, ngày tạo, các bước sửa
  (một file `provenance.json` cạnh asset hoặc trường trong dataset). Cần khi tranh chấp và khi
  store/publisher yêu cầu khai báo.
- Không loot box/gacha mua bằng tiền thật (Bỉ/Hà Lan cấm, nhiều nước đòi công bố tỉ lệ).
  Không trao đổi vật phẩm giữa người chơi (mở đường RMT/fraud). Bán trực tiếp, giá niêm yết.

## 3. Kiến trúc hệ thống

```
Browser / PWA (Angular 22, giữ nguyên)
   │  HTTPS + (V2: WebSocket)
   ▼
Cloudflare Workers
   ├── apps/web        SSR + static assets (đã có)
   └── apps/api        Hono trên Workers (mới)
         ├── Durable Objects
         │     ├── MatchmakingQueue   1 DO / mode / bracket rating
         │     ├── MatchRoom          V2 realtime, WS hibernation bắt buộc
         │     └── PlayerSession      presence + rate-limit trận/phút
         ├── D1        players, sessions, boards, matches, ledger, leaderboard
         ├── KV        session tokens (TTL 30d), config/flags, cache leaderboard
         ├── Queues    tính rating Glicko-2, mail, webhook thanh toán (idempotent)
         └── R2        chỉ dùng nếu replay vượt cỡ D1 (mặc định: không cần)

libs/shared/engine (mới, tag scope:shared, framework-free)
   → battle engine deterministic, chạy CẢ browser (render/replay) lẫn Worker (authoritative)
```

- **Server-authoritative tuyệt đối**: client chỉ gửi quyết định (draft, xếp board); server tự sim
  ra kết quả. Không bao giờ tin kết quả từ client.
- **Replay** = `{gameVersion, seed, boardA, boardB}` (vài trăm byte, lưu D1). Xem lại = client sim lại.
  `GameVersion` trong `primitives.ts` version hoá engine + balance để replay cũ vẫn đúng sau patch.
- Board input/output tái dùng **share code `?d=`** hiện có — mang team từ builder vào trận và ngược lại.
  Quy tắc CLAUDE.md giữ nguyên: không append vào `?d=`, thông tin thêm đi query param riêng.

## 4. Battle engine (`libs/shared/engine`)

- Thuần function, không I/O, không `Date.now()`/`Math.random()`. RNG là PRNG seeded
  (mulberry32/xoshiro) truyền vào. Cùng seed → cùng event log trên mọi runtime.
- **Event-driven**: keyword là handler đăng ký vào hook
  (`onAttackDeclared`, `onDamageResolving`, `onUnitSlain`, `onRoundStart`, …);
  status là stack có duration. Thứ tự resolve deterministic: theo vị trí board, rồi thứ tự apply.
- Output: event log tuần tự (`UnitAttacked`, `SpellCast`, `StatusApplied`, `UnitDied`, …) — đây là
  interface duy nhất giữa engine và renderer.
- Test: property-based (2 lần sim cùng seed = cùng log, node lẫn browser), golden test cho từng
  keyword và từng cặp tương tác. Chạy `npx nx test shared-engine`.

## 5. Keyword — phân loại & phạm vi V1

47 entries trong `data/canonical/keywords.json` ≈ 30 cơ chế thật (phần còn lại là token UI:
`attack_stat`, `health`, `gold`, `current_gold`…). Khi làm asset riêng: **đổi tên/theme, giữ nguyên
`key`** làm ID cơ chế trong engine — text hiển thị nằm ở data (RichTextToken, giữ `{0}` placeholder),
cơ chế nằm ở code.

| Nhóm | Keyword | Engine xử lý | Phase |
| --- | --- | --- | --- |
| A. Combat passive | `ranged`, `taunt`, `double_strike`, `cleave`, `pierce`, `lethal`, `venomous`, `cannot_attack`, `conceal` | Sửa luật chọn mục tiêu / cách đánh | **V1** |
| B. Status/stack | `safeguard`, `last_chance`, `vulnerable`, `burn`, `reborn`, `reborn_keep_attack` | Stack có duration, resolve theo thứ tự apply | **V1** |
| C. Trigger | `deploy`, `demise`, `slay`, `on_attack`, `counter`, `start_of_battle`, `event_on_start_of_round`, `event_on_end_turn`, `aura`, `event_space_available` | Hook vào event bus | **V1** (trừ hook draft) |
| D. Kinh tế/draft | `gold`/`income`, `refresh`, `sell`, `conjure`, `consume`, `enhancements` (+`double_`/`keep_`), `alchemy`+`celestial_medicine`, `descend`, `sanctum`(+`_spell`), `remove`, deploy-as-spell | Cả một mini-game kinh tế riêng | **V2+** — đây là chỗ được tự do thiết kế lại nhiều nhất |

Bug nằm ở **ma trận tương tác**, không ở keyword đơn lẻ. Viết quy tắc chung trước, golden test theo
quy tắc, không xử case-by-case. Các cặp bắt buộc có test:

- `lethal`/`venomous` × `safeguard`, `last_chance` (chặn destroy-effect hay chỉ chặn damage?)
- `reborn` × `demise` (demise trigger trước hay sau hồi sinh?)
- `pierce`/`cleave` × `conceal` (AoE có trúng unit ẩn không?)
- `burn` × `last_chance`, `vulnerable` × `safeguard`, `double_strike` × `counter`

## 6. Renderer V1: Angular DOM + GSAP

- Battle board render bằng component card sẵn có từ `@mythictatics/web/builder`
  (CardPreview + card components) — không viết lại visual card.
- **GSAP** (free toàn phần, gồm Flip/MorphSVG): unit lướt tới đánh (FLIP transform), hit flash,
  screen shake, floating damage number, HP bar tween. Timeline của GSAP đọc tuần tự event log
  của engine; tốc độ x1/x2/x4 = `timeScale`.
- Tôn trọng `prefers-reduced-motion`: giảm về fade/instant, kết quả trận không phụ thuộc animation.
- Route battle là lazy-loaded route; **không** render battle trên server — trang battle prerender
  ở loading state như quy tắc CatalogService hiện hành.
- V2 (chỉ khi cần juice thật): PixiJS v8 mount trong một component, `afterNextRender` + dynamic
  `import()`, tuyệt đối không lọt vào server bundle (`server.ts` là fetch-based neutral).
  UI quanh canvas vẫn là DOM Angular.
- Character animation: static art + procedural tween trước; khi cần nhân vật cử động →
  **Rive** (vector, khớp art direction, runtime mở). Lottie chỉ cho hiệu ứng UI.

## 7. Art direction: vector toàn phần

Design system sống ở artifact "Realmbound Design System" (link trong PR/issue tracker) — nguồn
chuẩn cho token màu, type, khung card, icon keyword. Nguyên tắc:

- **Style**: flat vector, silhouette đậm, hình học thiêng (vòng halo, tia), không gradient ảnh,
  tối đa ~6 màu mỗi illustration. Mọi asset là SVG.
- **Realm mới** (tên tạm, kiểm tra trademark sau): Aaru (Ai Cập, hổ phách), Elysium (Hy Lạp, thiên thanh),
  Vanaheim (Bắc Âu, băng lam), Kunlun (Trung Hoa, ngọc bích), Eridu (Lưỡng Hà, đỏ son),
  Yomi (Nhật, tím), Asadal (Hàn, mận đỏ), Neutral (đá xám). Mapping số realm giữ nguyên
  `REALM_NUMBERS` trong contracts.
- **Pipeline giữ nguyên cơ chế repo**: asset mới commit vào repo, đi qua `imageSha256` trong dataset
  test (đổi nguồn ảnh, không đổi cơ chế chống swap). Icon keyword thay các `<sprite name=...>` token
  trong RichText — khớp parser sẵn có.
- Fonts self-host qua `@fontsource/*` như quy tắc PWA hiện hành (không Google Fonts trong `index.html`).
- Vector hoá giúp bỏ phần lớn 40MB raster khỏi lazy-cache — art SVG nhỏ có thể cân nhắc đưa vào
  prefetch group sau khi đo, nhưng mặc định vẫn theo quy tắc cũ: không prefetch art.

## 8. Authentication

1. **Guest-first**: "Chơi ngay" → account ẩn danh + session cookie (HttpOnly, Secure, SameSite=Lax).
   Progress lưu server-side từ trận đầu.
2. **Nâng cấp**: OAuth Google + Discord, và passkey/WebAuthn. Guest link vào account thật, giữ progress.
   Không làm email/password (khỏi hệ reset/verify).
3. **Session**: token ngẫu nhiên → KV (TTL 30 ngày) + bảng session D1 để revoke tức thì khi phát hiện
   gian lận. Không JWT stateless cho game có tiền tệ.
4. Tự host bằng better-auth/openauth trên Workers ($0) — không Clerk/Auth0/Firebase.
5. Turnstile (free) ở signup + endpoint nhạy cảm.

## 9. Kinh tế & thanh toán

- **Ledger append-only** (`playerId, delta, reason, refId, createdAt`) — số dư là tổng ledger,
  không phải cột bị UPDATE. Audit gian lận, hoàn tiền, đối soát webhook đều dựa vào đây.
- Hai lớp tiền tệ: soft (chơi mà có) + premium (mua). Bán cosmetic/battle pass/slot — tránh pay-to-win.
- **Cổng thanh toán**: Stripe không hỗ trợ merchant Việt Nam trực tiếp → dùng Merchant of Record
  **Paddle hoặc Lemon Squeezy** (~5% + $0.50/giao dịch, họ lo VAT/sales tax toàn cầu).
  Cổng nội địa (VNPay/MoMo/ZaloPay ~1–2%) làm sau nếu target VN.
- Webhook → Worker → Queues → xử lý idempotent (khoá theo `event_id`, ghi ledger, cấp entitlement).
  Không bao giờ cấp vật phẩm trong redirect callback của trình duyệt.

## 10. Chi phí vận hành (giá Cloudflare đối chiếu 27/09/2026)

Giả định mỗi DAU: ~200 API request, ~10 trận/ngày, ~50ms CPU sim + ~10 rows written mỗi trận.

| Khoản | ≤1k DAU | 10k DAU |
| --- | --- | --- |
| Workers Paid (gồm 10M req + 30M CPU-ms) | $5 | $5 |
| Request vượt mức ($0.30/M) | $0 | ~$15 |
| CPU vượt mức ($0.02/M ms) | $0 | ~$8 |
| Durable Objects (ghost ≈ $0; số lớn khi realtime WS) | $0 | ~$3–10 |
| D1 (25B reads + 50M writes gồm sẵn) | $0 | ~$0–5 |
| KV/R2/Turnstile/static assets | $0 | ~$0–2 |
| Domain + email giao dịch | ~$1 | ~$1–20 |
| **Tổng hạ tầng** | **~$6/tháng** | **~$30–70/tháng** |

Static assets miễn phí không giới hạn; art vector càng làm phần này không đáng kể. Chi phí lớn thật
là phí MoR ~5% doanh thu và thời gian vận hành (CS, ban gian lận, balance). Ngoại suy 100k DAU
~$300–600/tháng — không có bậc thang chi phí đột ngột.

## 11. PWA → mobile

- **Web Push** (kết quả ghost battle, daily reward): server VAPID chạy trên Worker, subscription lưu D1.
  iOS chỉ cho push khi đã Add to Home Screen → UX nhắc cài app trước khi xin quyền.
- **Google Play qua TWA** (Bubblewrap, $25 một lần): kênh phân phối phụ; lưu ý Play Billing 15–30%
  cho vật phẩm digital — web luôn là kênh mua chính.
- iOS App Store không nhận PWA wrapper — trên iOS "install" = Add to Home Screen, cần banner hướng dẫn
  riêng (Safari không có prompt tự động).
- `ngsw-config.json`: loại trừ `/api/**` khỏi service worker — API game không bao giờ đi qua cache.

## 12. Roadmap

| Phase | Thời lượng | Nội dung | Nghiệm thu |
| --- | --- | --- | --- |
| 0. Nền | 1 tuần | Game design doc (luật combat, tập keyword V1); design system + card mẫu duyệt style; check trademark codename | Doc + design system được duyệt |
| 1. Engine | 3–4 tuần | `libs/shared/engine` + replay + golden tests; **đấu với AI ngay trên trang builder** (thuần client) | Cùng seed = cùng log trên node lẫn browser; chơi được vs AI trên site |
| 2. API + Auth | 2–3 tuần | `apps/api` (Hono), D1 schema, guest + OAuth + passkey, Turnstile | Guest→link OAuth giữ progress; e2e cover flow auth |
| 3. Async PvP | 2–3 tuần | MatchmakingQueue DO, ghost battle, Glicko-2 qua Queues, leaderboard, replay | Ranked ghost end-to-end trên `cf-preview` |
| 4. Asset swap | song song 1–3 | Sinh + duyệt bộ art vector theo design system, thay text/tên, cập nhật `imageSha256` | `nx test shared-domain` xanh với dataset mới; không còn asset gốc trong repo |
| 5. Realtime (tuỳ chọn) | 2–3 tuần | MatchRoom DO + WS hibernation, spectate | 2 browser đấu realtime; duration ≈ 0 khi idle |
| 6. Economy + Shop | 2–3 tuần | Soft currency, daily quest, MoR + webhook idempotent + entitlement | Mua sandbox → inventory + ledger khớp |
| 7. Mobile hoá | 1–2 tuần | Web Push, TWA lên Play, iOS install banner, loại trừ `/api` khỏi SW | Push nhận được trên Android + iOS đã cài PWA |

## 13. Ràng buộc repo xuyên suốt

- Contract mới (Board, MatchResult, LedgerEntry…) vào `libs/shared/contracts` đúng pattern hai
  entry point (types rẻ / zod chỉ nơi validate). Chạy `npx nx test shared-domain` sau mỗi lần chạm schema.
- `libs/shared/*` giữ framework-free (`scope:shared`) — engine phải chạy được trên Worker.
- Verify hành vi Worker bằng `npx nx run web:cf-preview` / `npx nx e2e web-e2e`, không chỉ `nx serve`.
- Card text luôn là `RichTextToken[]`, không bao giờ là HTML string (ranh giới bảo mật).
- Rủi ro xếp hạng: (1) khối lượng engine — bắt đầu tập keyword con, mở rộng theo golden test;
  (2) gian lận kinh tế — ledger + server-authoritative từ đầu; (3) trademark codename trước khi công bố.

## 14. Tiến độ

**29/09/2026 — Phase 1 (engine + đấu AI), chạy bằng asset/text hiện có:**

- `libs/shared/engine`: engine deterministic (mulberry32 seeded), event log, toàn bộ keyword nhóm A/B/C,
  text combat của từng card theo realm (`abilities/`), Descend + Power của patron có tác dụng trong trận,
  AI opponent (comp cộng đồng / board ngẫu nhiên). Luật đã chốt ghi trong `libs/shared/engine/README.md`.
- Contract `MatchSetup` / `BattleEvent` / `BattleResult` trong `libs/shared/contracts` (zod ở `/schemas`).
- `/battle` (`libs/web/battle`): board từ builder (`?d=`) đấu AI, renderer Angular DOM + GSAP, x1/x2/x4,
  pause/skip, reduced-motion, log trận; link chứa seed = replay.
- Nghiệm thu Phase 1: cùng seed = cùng log trên node lẫn browser (golden hash, e2e trên `cf-preview`).
- Tạm thời (chờ V2 kinh tế): card chỉ có hiệu ứng shop (Deploy/Sell/End Turn/Sanctum/Alchemy/hand) đánh như
  thân trơn — danh sách ở `abilities/no-battle-text.ts`; Celestial Medicine trong trận = +T/+T.

Tiếp theo: Phase 2 (`apps/api` Hono + D1 + auth) — cần tạo tài nguyên Cloudflare và app OAuth trước.
