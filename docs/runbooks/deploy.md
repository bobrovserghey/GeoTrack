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
3. Прогнать миграции против этой базы (см. `docs/specs/debt.md` — до этого
   нужно пересчитать `when` в `packages/db/migrations/meta/_journal.json`,
   иначе часть миграций 0001–0003 может не примениться):
   ```bash
   DATABASE_URL="..." pnpm db:migrate
   ```
   Если скрипта `db:migrate` в `packages/db/package.json` ещё нет —
   см. ту же запись в `debt.md`, там расписано, что `db:push`/`db:generate`
   делают не то, что нужно для применения уже написанных файлов миграций.

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

> **Ожидаемо после синка: каждый запуск аудита в проде будет красным.**
> Функция `audit-run` упадёт с `audit-run dependencies are not configured`
> (non-retriable, одна попытка без ретраев), а аудит останется в статусе
> `queued` — страница прогресса будет крутиться. Это не поломка деплоя:
> шаги пайплайна ещё не привязаны к БД (`setAuditRunDeps` никто не
> вызывает), и воркер намеренно падает громко вместо того, чтобы
> отрапортовать «успех», ничего не записав. Пропадёт, когда будет сделана
> задача на реальную привязку пайплайна — см. `docs/specs/debt.md`, запись
> от 2026-10-02.

---

## 4. Проверка «не стартует с неполной конфигурацией»

Временно удалить в дашборде одну из проверяемых переменных и передеплоить —
ожидается явный отказ **на этапе сборки** (Vercel) или при запуске
контейнера (Railway) в логах деплоя, не 500 на первом реальном запросе
пользователя. После проверки — вернуть переменную и передеплоить снова.

Проверяемые переменные — это:

- Vercel (`apps/web`): любая из обязательных переменных в `apps/web/src/lib/env.ts`
  (то же, что перечислено в `apps/web/.env.example`).
- Railway (`apps/worker`): `INNGEST_SIGNING_KEY` — **единственная**
  проверяемая переменная воркера (`apps/worker/src/env.ts`). `PORT` тоже
  лежит в `apps/worker/.env.example`, но при старте не проверяется: без него
  сервер просто слушает порт 3000 по умолчанию, падения не будет.

---

## Что не входит в эту инструкцию

- Observability (Sentry/PostHog/Langfuse) — отдельная будущая задача, не
  часть T-00 (решение продакта от 2026-10-01).
- Реальные API-ключи движков (Perplexity/OpenAI/Google/Anthropic) — worker
  их пока нигде не читает в рантайме (см. `docs/specs/T-00.md`), заводить
  их в Railway преждевременно.
- DNS на кастомный домен — делается в Vercel/Railway дашбордах отдельно,
  вне рамок T-00.
