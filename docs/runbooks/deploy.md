# Деплой apps/web (Vercel) и apps/worker (Railway) — инструкция для продакта

Эти шаги выполняет продакт вручную — вход в аккаунты, создание проектов и
ввод настоящих секретов агент не делает (это чувствительные/необратимые
действия, запрещённые правилами сессии). Код-часть (Dockerfile, конфиг
валидации при старте, списки переменных) уже готова — см.
`docs/specs/T-00.md`.

---

## 1. Supabase — база данных и Auth

1. В существующем проекте Supabase: Settings → Database → Connection string
   (режим **Transaction** для serverless-клиентов) → это `DATABASE_URL`.
2. Settings → API → `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`;
   `anon public` ключ → `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
   `service_role` ключ → `SUPABASE_SERVICE_ROLE_KEY` (секретный, не публиковать).
3. **До миграций проверить роль подключения — тем же соединением, которым
   ходит приложение.** Миграция `0005_enable_rls` включает row level security
   на всех таблицах (ADR-028). Если роль из `DATABASE_URL` не владелец таблиц
   и не имеет `BYPASSRLS`, после миграции запросы начнут возвращать **пустые
   результаты без ошибки** — приложение продолжит работать и покажет пустые
   отчёты. Проверка идёт через сам `DATABASE_URL`:
   ```bash
   psql "$DATABASE_URL" -c "select current_user, \
     (select rolbypassrls from pg_roles where rolname = current_user) as bypassrls, \
     coalesce(bool_and(pg_has_role(current_user, c.relowner, 'usage')), true) as owns_all \
     from pg_class c join pg_namespace n on n.oid = c.relnamespace \
     where n.nspname = 'public' and c.relkind in ('r', 'p');"
   ```
   Проверка проходит, если **`bypassrls = t` ИЛИ `owns_all = t`** — достаточно
   любого: первое значит, что роль обходит RLS явной привилегией, второе — что
   она владеет всеми таблицами `public`, а владельцу Postgres RLS не применяет
   (почему именно так и почему в запросе `'usage'`, а не `'member'` —
   ADR-028). Если оба `f` — миграцию не применять и сообщить агенту.

   На пустой базе, а шаг идёт до миграций, таблиц ещё нет: агрегат считать не
   по чему, `coalesce(…, true)` даёт `owns_all = t`, и ориентироваться надо на
   `bypassrls`. Для дефолтного Supabase там `t`. `owns_all` становится
   содержательным при повторной проверке после пункта 4.

   **Не проверять это в SQL Editor через `current_user`**: там `current_user` —
   роль самого редактора, а не роль из `DATABASE_URL`, и проверка выглядит
   успешной именно в том случае, от которого защищает. Если `psql` под рукой
   нет, взять username из `DATABASE_URL` (между `//` и `:`), отбросить суффикс
   `.<projectref>` — то есть взять часть до первой точки — и подставить
   литералом:
   ```sql
   select rolname, rolbypassrls from pg_roles
   where rolname = 'имя-роли-из-DATABASE_URL-без-суффикса';
   ```
   Суффикс обязательно убрать: у пулера в режиме Transaction username —
   `postgres.<projectref>`, это имя для аутентификации в Supavisor, а не роль в
   `pg_roles`. С суффиксом вернётся 0 строк, что легко принять за провал
   проверки при исправной роли.
4. Прогнать миграции на **пустую** базу (`pnpm db:migrate` читает
   `DATABASE_URL` и без неё падает; журнал и снимки исправлены в PR #57):
   ```bash
   DATABASE_URL="..." corepack pnpm db:migrate
   ```
   Для одной БД выбирается один путь: **только `db:migrate`** (боевая/staging)
   либо только `db:push` (одноразовая dev-БД). База, созданная через `db:push`,
   не имеет таблицы `__drizzle_migrations` — `db:migrate` на ней упадёт.
   Подробности и сценарии — `docs/specs/debt.md` («миграции drizzle»).
5. **После миграций проверить, что RLS включён.** Три проверки, все три
   обязательны перед приёмом реальных денег:

   а) Supabase → Advisors → **Security**: не должно быть предупреждений
   «RLS disabled in public». Это самый быстрый способ увидеть таблицу,
   которую миграция пропустила.

   б) В SQL Editor — `relrowsecurity` должно быть `true` у всех таблиц
   (сейчас их 20):
   ```sql
   select relname, relrowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
   order by relname;
   ```

   в) Запрос с публичным ключом должен вернуть пустой массив или отказ, а не
   данные:
   ```bash
   curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/audits?select=id" \
     -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
   ```
   Если здесь приходят строки — RLS не применился, дальше не идти.

   После этого проверить, что приложение работает: создание тизера, вебхук
   оплаты, страница отчёта, вход в админку. Пустые отчёты при работающем
   интерфейсе — признак неверной роли из пункта 3.

---

## 2. Vercel — `apps/web`

1. Импортировать репозиторий в существующий аккаунт Vercel.
2. Project Settings → General → **Root Directory**: `apps/web`
   (Vercel сам распознает pnpm-workspace и соберёт зависимости из корня
   монорепозитория — `vercel.json` не требуется).
3. Build Command — **оставить пустым** (Vercel возьмёт скрипт `build` из
   `apps/web/package.json`, а он сейчас
   `node scripts/check-env.mjs && next build`). **Не вписывать сюда
   `next build` вручную**: это переопределит скрипт и выключит проверку
   переменных на сборке (п. 5) — вернётся ровно тот режим отказа, против
   которого сделана эта задача (деплой «успешен», 500 на первом запросе).
   Install Command — `pnpm install --frozen-lockfile`.
4. Project Settings → Environment Variables — внести все переменные из
   `apps/web/.env.example` для окружений **Production** и **Preview** (обе
   проходят проверку). **Важно**: эти переменные должны быть доступны **во
   время сборки**, не только в рантайме — Vercel-настройка «Automatically
   expose System Environment Variables»/галочка «Sensitive» на переменной
   не должна прятать их от шага сборки (по умолчанию Vercel даёт всем
   заданным переменным проекта быть видимыми на сборке — отдельно трогать
   не нужно, если не меняли эту настройку).
5. Задеплоить (push в `main` или вручную из дашборда). Если какая-то
   переменная не задана — **сборка упадёт** (`apps/web/scripts/check-env.mjs`
   запускается перед `next build`), Vercel покажет деплой как неудавшийся
   в Deploy Logs (`Missing required environment variable(s): ...`) — сайт не
   обновится. Это намеренно на уровне сборки, не только рантайма: Vercel не
   запускает `next start`, он поднимает собранный вывод как serverless-
   функции, и без проверки на сборке неполная конфигурация обнаружилась бы
   только 500-кой на первый реальный запрос пользователя при уже
   «успешном» по мнению Vercel деплое.

---

## 3. Railway — `apps/worker`

1. В существующем проекте Railway: New Service → Deploy from GitHub repo,
   выбрать этот репозиторий.
2. Service Settings → Source: убедиться, что используется `railway.json`
   из корня репозитория (builder `DOCKERFILE`, путь
   `apps/worker/Dockerfile`, build context — корень репо: так pnpm видит
   весь workspace, не только `apps/worker`, см. комментарий в самом
   `Dockerfile`).
3. Service Settings → Variables — внести переменные из
   `apps/worker/.env.example` (`INNGEST_SIGNING_KEY` — из дашборда Inngest
   Cloud, Settings → Signing Key; `PORT` Railway задаёт сам, можно не трогать).
4. После первого деплоя: Settings → Networking → Generate Domain — получить
   публичный URL сервиса.
5. Проверить health check:
   ```bash
   curl https://<ваш-worker-домен>/healthz
   # -> ok
   ```
6. В Inngest Cloud: App → Sync — указать
   `https://<ваш-worker-домен>/api/inngest`, чтобы Inngest узнал про функции
   воркера.

> **Ожидаемо после синка: аудиты проходят статусы, но содержимое пустое.** С T-79
> воркер пишет статусы и события в БД (нужен `DATABASE_URL`), не залипает при сбое
> (`needs_attention`/`failed`) и не запускается дважды на один аудит. Но шаги
> пайплайна (crawl, опрос движков, бренд-промпты) пока **заглушки**: платный аудит
> дойдёт до `in_review` без реального отчёта. Реальные платежи включать только после
> замены заглушек настоящими шагами — см. `docs/specs/debt.md` (блоки A–D).

---

## 4. Проверка «не стартует с неполной конфигурацией»

Временно удалить в дашборде одну из проверяемых переменных и передеплоить —
ожидается явный отказ **на этапе сборки** (Vercel) или при запуске
контейнера (Railway) в логах деплоя, не 500 на первом реальном запросе
пользователя. После проверки — вернуть переменную и передеплоить снова.

Проверяемые переменные — это:

- Vercel (`apps/web`): любая из обязательных переменных в `apps/web/src/lib/env.ts`
  (то же, что перечислено в `apps/web/.env.example`).
- Railway (`apps/worker`): `INNGEST_SIGNING_KEY` и `DATABASE_URL`
  (`apps/worker/src/env.ts`). `PORT` тоже лежит в `apps/worker/.env.example`, но
  при старте не проверяется: без него сервер слушает порт 3000, падения не будет.

---

## Что не входит в эту инструкцию

- Observability (Sentry/PostHog/Langfuse) — отдельная будущая задача, не
  часть T-00 (решение продакта от 2026-10-01).
- Реальные API-ключи движков (Perplexity/OpenAI/Google/Anthropic) — worker
  их пока нигде не читает в рантайме (см. `docs/specs/T-00.md`), заводить
  их в Railway преждевременно.
- DNS на кастомный домен — делается в Vercel/Railway дашбордах отдельно,
  вне рамок T-00.

---

## Чек-лист продакта (по порядку)

Нужные аккаунты: Supabase, Vercel, Railway, Inngest Cloud, Cloudflare
(Turnstile), Resend, Paddle (sandbox). Все 17 переменных `apps/web` должны быть
**непустыми на этапе сборки** — иначе Vercel-сборка упадёт, это намеренно.

**A. Supabase (новый проект под staging/prod, не dev-база из `db:push`)**
- [ ] Project Settings → Database → Connection string → URI, **Transaction pooler**
      (порт 6543); пароль с `!` и т.п. — percent-encode → `DATABASE_URL`
- [ ] Settings → API: Project URL (без `/rest/v1/`), `anon`/publishable,
      `service_role`/secret ключи
- [ ] Положить значения в локальный `apps/web/.env.local` (не в чат) и сказать
      агенту: он выполнит `db:migrate` и проверит таблицы
- [ ] **После миграций** — Advisors → Security: нет предупреждений
      «RLS disabled in public» (раздел 1, пункт 5). Если есть — не включать
      платежи и сообщить агенту

**B. Inngest Cloud**
- [ ] Создать приложение; **Event Key** → `INNGEST_EVENT_KEY` (web),
      **Signing Key** → `INNGEST_SIGNING_KEY` (worker)
- [ ] `INNGEST_DEV` в прод-окружениях **не задавать**

**C. Cloudflare Turnstile и Resend**
- [ ] Turnstile: виджет под домен Vercel → site key и secret key. Для staging
      допустимы тестовые always-pass ключи Cloudflare (`1x00000000000000000000AA` /
      `1x0000000000000000000000000000000AA`), в production — настоящие
- [ ] Resend: API key (`RESEND_API_KEY`); для реальных писем — подтвердить домен
      отправки (SPF/DKIM). Без домена письма уйдут только на адрес владельца

**D. Vercel (`apps/web`)**
- [ ] Import репозитория; Root Directory `apps/web`; Build Command **пустой**
      (иначе выключится проверка env); Install `pnpm install --frozen-lockfile`
- [ ] Environment Variables (Production и Preview) — все 17 из
      `apps/web/.env.example`; секреты `ADMIN_SECRET`/`AUDIT_SERVICE_KEY` —
      новые случайные (`openssl rand -hex 24`), не из локального `.env.local`
- [ ] `NEXT_PUBLIC_APP_URL` — итоговый адрес Vercel (после первого деплоя
      поправить и передеплоить)
- [ ] Deploy; если сборка упала с `Missing required environment variable(s)` —
      добавить названные переменные

**E. Paddle (пока sandbox; боевой аккаунт — после T-51)**
- [ ] Notifications → webhook destination: `https://<домен-vercel>/api/webhooks/paddle`
      (событие `transaction.completed`), его секрет → `PADDLE_WEBHOOK_SECRET`
- [ ] Checkout settings → default payment link: домен Vercel
- [ ] Client-side token (`test_…`) → `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`; API key,
      Price ID продукта(ов) — как в локальном sandbox

**F. Railway (`apps/worker`)**
- [ ] New Service → Deploy from GitHub repo (подхватит `railway.json`)
- [ ] Variables: `INNGEST_SIGNING_KEY` и `DATABASE_URL` (тот же, что у web;
      остальное Railway задаёт сам)
- [ ] Networking → Generate Domain; `curl https://<домен>/healthz` → `ok`
- [ ] Inngest Cloud → Sync app → `https://<домен>/api/inngest` (после каждого
      деплоя, где менялись функции: `onFailure` — отдельная функция `audit-run-failure`)
- [ ] **Помнить:** шаги пайплайна пока заглушки — аудит проходит статусы, но отчёт
      пустой. Реальные платежи не включать

**G. Что проверит агент после вашего «готово»:** применённые миграции, `/healthz`,
вход в админку, `/api/checkout` → оплата тестовой картой → вебхук 200 → платный
аудит с `parent_audit_id`, отсутствие `INNGEST_DEV` и тестовых ключей в prod.

