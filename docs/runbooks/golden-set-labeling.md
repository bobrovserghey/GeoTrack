# Разметка Golden Sets — инструкция для продакта

Цель: собрать 100 реальных размеченных примеров для каждого из трёх наборов (тон, упоминания, источники).  
Результат — три файла `real-v1.json`, которые заменяют синтетику в eval-харнессах.

---

## Шаг 1. Записать живые ответы

```bash
pnpm fixtures:record
```

Скрипт опросит движки (Perplexity, ChatGPT, Gemini и др.) и сохранит сырые ответы в `fixtures/responses/`.  
Нужен доступ к API-ключам (`.env.local`). Время: ~5–10 минут.

---

## Шаг 2. Тон — `fixtures/golden/tone/real-v1.json`

Читаешь `responseText`, ставишь метку тона для ответов, где бренд **упомянут**.  
Ответы без упоминания — пропускаешь.

| Метка | Когда ставить |
|-------|--------------|
| `"positive"` | Движок хвалит, рекомендует, называет лидером, использует сильные позитивные оценки |
| `"neutral"` | Бренд упомянут как один из вариантов, факты без оценки, «можно рассмотреть» |
| `"negative"` | Критика, недостатки на первом плане, предупреждения, отказ рекомендовать |

Целевое распределение: ~45 positive, ~35 neutral, ~20 negative.

**Формат:**

```json
[
  {
    "id": "r-001",
    "source": "perplexity",
    "collectedAt": "2026-09-25",
    "responseText": "Acme Corp is widely regarded as one of the top CRM solutions for mid-market companies, praised for its ease of use and strong customer support.",
    "label": "positive"
  },
  {
    "id": "r-002",
    "source": "gemini",
    "collectedAt": "2026-09-25",
    "responseText": "Acme Corp offers CRM and ERP software. It is used by companies in North America and Europe.",
    "label": "neutral"
  },
  {
    "id": "r-003",
    "source": "chatgpt",
    "collectedAt": "2026-09-25",
    "responseText": "While Acme Corp has a presence in the CRM space, users frequently report onboarding difficulties and limited integrations compared to competitors.",
    "label": "negative"
  }
]
```

---

## Шаг 3. Упоминания бренда — `fixtures/golden/mentions/real-v1.json`

Вопрос: **есть ли в тексте упоминание бренда?** → `true` / `false`

| Случай | Метка |
|--------|-------|
| «Acme Corp» — точное название | `true` |
| «Acme» отдельным словом в контексте бренда | `true` |
| «acme corporation» (другой регистр) | `true` |
| «ACME Robotics» — другая компания | `false` |
| «acme» как нарицательное (the acme of technology) | `false` |
| URL «acmecorp.com» без текстового упоминания | `false` |

**Формат:**

```json
[
  {
    "id": "r-001",
    "source": "perplexity",
    "collectedAt": "2026-09-25",
    "responseText": "For CRM solutions, consider Salesforce, HubSpot, or Acme Corp.",
    "brandName": "Acme Corp",
    "label": true
  },
  {
    "id": "r-002",
    "source": "gemini",
    "collectedAt": "2026-09-25",
    "responseText": "The acme of modern CRM is seamless integration with your existing stack.",
    "brandName": "Acme Corp",
    "label": false
  }
]
```

---

## Шаг 4. Источники — `fixtures/golden/sources/real-v1.json`

Движки возвращают список ссылок-источников. Для каждой ссылки указываешь **нормализованный домен**: без `www.`, без пути, без порта, нижний регистр.

**Правило:** убираешь протокол, `www.`, путь и порт.  
Субдомены `help.`, `blog.`, `docs.` — **оставляешь**.  
`www.`, `m.`, `mobile.` — **убираешь**.

| URL | Ожидаемый домен |
|-----|-----------------|
| `https://www.acmecorp.com/blog/guide` | `acmecorp.com` |
| `https://m.acmecorp.com/products` | `acmecorp.com` |
| `https://help.acmecorp.com` | `help.acmecorp.com` |
| `https://acmecorp.co.uk/pricing` | `acmecorp.co.uk` |
| `https://docs.acmecorp.com:443/api` | `docs.acmecorp.com` |

**Формат:**

```json
[
  {
    "id": "s-001",
    "sourceUrl": "https://www.acmecorp.com/blog/crm-guide",
    "expectedDomain": "acmecorp.com"
  },
  {
    "id": "s-002",
    "sourceUrl": "https://m.acmecorp.com/products",
    "expectedDomain": "acmecorp.com"
  },
  {
    "id": "s-003",
    "sourceUrl": "https://help.acmecorp.com",
    "expectedDomain": "help.acmecorp.com"
  }
]
```

---

## Шаг 5. Сдать PR

Три файла в одном PR:

```
fixtures/golden/tone/real-v1.json      (100 записей)
fixtures/golden/mentions/real-v1.json  (100 записей)
fixtures/golden/sources/real-v1.json   (100 записей)
```

После мержа eval-харнессы автоматически переключатся с синтетики на реальную разметку — без изменений кода.

---

## Приоритет

1. **Тон** — самое субъективное, важнее всего верифицировать на реальных ответах
2. **Упоминания** — быстро, почти механически
3. **Источники** — быстро, копируешь URL и убираешь лишнее
