# ADR-018 — Email-гейт, лимиты бесплатного потока и внутренние прогоны

**Статус:** Принято  
**Контекст:** T-25, T-26  
**Дата:** 2026-09-18

## Контекст

Тизер собирает email до дорогих brand-промптов. Нужно зафиксировать: (1) как
email захватывается и верифицируется, (2) как лимиты защищают бюджет,
(3) чем внутренние прогоны отличаются от клиентских.

---

## Решения

### Email-гейт (T-25)

**1. Три способа подачи email**

| Способ | `email_verified` сразу? | `auth_provider` |
|---|---|---|
| Поле + magic link (Supabase Auth `signInWithOtp`) | Нет | `magic_link` |
| Google OAuth (Supabase Auth) | Да | `google` |
| Microsoft OAuth (Supabase Auth) | Да | `microsoft` |

**2. Pipeline не ждёт подтверждения**

Ввод email в поле немедленно продолжает pipeline (`waiting_email → running`).
Supabase отправляет magic-link письмо параллельно. До клика по ссылке
`users.email_verified = false`.

**3. Inngest-событие `geotrack/audit.email.provided`**

Отправляется при любом из трёх способов сразу, не дожидаясь OAuth-callback или
клика по ссылке. Worker ждёт это событие с таймаутом 7 дней; по таймауту
pipeline продолжается (`email_timeout → completed`) без brand-промптов.

**4. Верификация через magic link**

`redirectTo` в OTP-письме: `/api/auth/callback?next=/report/{auditId}`.
Обработчик callback-а:
- обменивает код Supabase на сессию,
- ставит `users.email_verified = true`, `verified_at = now()`,
- редиректит на `/report/{auditId}`.

**5. OAuth callback**

Supabase redirect → `/api/auth/callback?next=/report/{auditId}`.
Тот же обработчик: создаёт/обновляет `users`, ставит `email_verified = true`.

**6. Нормализация email**

`email_normalized = trim().toLowerCase()` с удалением `+suффикс` и `.` для
gmail (`user.name+tag@gmail.com` → `username@gmail.com`). Нормализация по
public suffix list. Хранится в `users.email_normalized` и `audits.email_normalized`.

**7. Метрики**

PostHog: событие `email_lead` отправляется только при `email_verified = true`.

---

### Лимиты бесплатного потока (T-26)

*Детали в spec T-26; здесь — решения, влияющие на схему.*

- 1 бесплатный тизер на нормализованный **домен** в 30 дней  
- 3 бесплатных тизера на **подтверждённый** email в 30 дней  
- Одноразовые домены email и адреса без MX блокируются **до** дорогого шага  
- IP-лимит — мягкий (показывает Turnstile, не отказывает)  
- Дневной потолок — «очередь на завтра»  

---

### Внутренние прогоны (`is_internal`)

Два пути:
1. **Служебный ключ** (`GEOTRACK_SERVICE_KEY`) — скрипты и CI. Обходит лимиты
   по домену, email, IP, очереди. Не обходит потолок профиля.
2. **Белый список email команды** (хранится в конфигурации) — ручные и пакетные
   прогоны из админки. Требует **подтверждённой** сессии (клик по magic link
   или OAuth). Голый ввод email из белого списка без подтверждения флаг не даёт.

Оба пути ставят `is_internal = true`. Внутренние прогоны:
- не считаются лидами в PostHog,
- исключаются из бенчмарков и воронки,
- не получают письмо при `delivered`.

---

## Альтернативы, которые не приняты

| Вариант | Почему отклонён |
|---|---|
| Подтверждение перед продолжением pipeline | Фрикция для пользователя; теряем часть лидов |
| Собственный email-сервер (не Supabase) | Supabase уже выбран (ADR-002); дублирование инфраструктуры |
| Один лимит по IP вместо email | IP-лимит легко обходится; email сложнее подделать |
| Хранить email только в Supabase Auth | Нужно нормализованное поле для дедупликации и лимитов |
