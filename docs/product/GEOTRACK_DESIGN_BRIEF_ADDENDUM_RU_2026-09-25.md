# GeoTrack — дополнение к дизайн-брифу: рынки и языки, методика промптов, аутрич и бюджеты

Дата: 2026-09-25. Версия 1.1, дополнение к GEOTRACK_DESIGN_BRIEF_RU.md версии 2.1 (13 сентября 2026). Проект: GEO. Автор: Serghey (ProDuck:t Space) при участии Claude. Основание: GEOTRACK_PRODUCT_CONCEPT_RU.md (версия 1.3), GEOTRACK_TECH_PLAN_MVP_RU.md (версия 1.5), GEOTRACK_UNIT_ECONOMICS_CHECK_RU.md (версия 1.3), GEOTRACK_SALES_STRATEGY_RU.md (версия 1.4).

## Резюме

Дополнение переносит в дизайн решения 24–25 сентября: локаль промптов как пару «язык плюс рынок», клиентский слой и персоны запроса, прогон без поиска, аутрич как тот же Free snapshot, что и на лендинге, и бюджеты аутрича в админке. Оно меняет семь существующих экранов и не добавляет новых: у аутрича и лендинга одна точка входа в воронку — экран результата S4.

**Ключевые предположения**:
- Макеты брифа 2.1, включая админку по промпту 6.16, уже есть, поэтому все промпты Д1–Д6 написаны как правки существующих артбордов.
- Интерфейс и отчёт остаются на английском и румынском. Русский существует только как язык вопросов к движкам и в интерфейсе не появляется.
- Админка — только десктоп, только английский, плотная, без маркетинговой подачи.

**Рекомендация**: запускать Д1 и Д2 первыми — они нужны для аутрича, затем Д4, Д5, Д3, Д6.

**Статус**: готово к передаче в Claude Design; при следующей сборке брифа вливается в него как версия 2.2.

---

## 1. Что изменилось и где это видно

| Решение | Экраны | Промпт |
|---|---|---|
| Рынок и язык вопросов отдельно от языка отчёта | S1, S14 | Д3, Д1 |
| Вопросы покупателей и дополнительные рынки перед оплатой, новый состав тарифов | S8, S9 | Д4 |
| Прогон без поиска, срезы видимости, находки разрывов, слои промптов | S6, S7, S12 | Д5 |
| Методика: два режима, рынки, ограничения | S13 | Д6 |
| Аутрич как Free snapshot, подготовленный заранее | S14, S4 | Д1, Д2 |
| Бюджеты аутрича на компанию, пачку и месяц | S14 | Д1 |

Словарь интерфейса. Локаль в интерфейсе называется «Market», а не «Locale»: пользователь выбирает, на каком рынке и каком языке ему задают вопросы покупатели. Варианты: «Global — English», «Moldova — Romanian», «Moldova — Russian», «Romania — Romanian». Персона запроса — «Buyer type», клиентский слой — «Your buyers' questions», прогон без поиска — «Without web search», индикатор — «Known without search».

---

## 2. Спецификации экранов

### 2.1 S14. Админка: аутрич и бюджеты

В навигации админки появляется раздел **Outreach** с тремя экранами. Существующие экраны меняются точечно: форма запуска аудита получает поле Market, очередь — уведомления о бюджете.

**Список пачек.** Таблица: категория, рынок, число доменов, бюджет, потрачено, пропущено по бюджету, открытий ссылки, оставлено email, перешло к оплате, дата. Сверху — полоса месячного лимита: потрачено и зарезервировано против лимита.

**Новая пачка.** Поля: список доменов (вставка столбцом или CSV), категория, рынок, бюджет пачки в долларах, максимум доменов. Значения по умолчанию подставлены из настроек. Справа — панель оценки: прогон категории (или «cached — $0»), снапшот на число доменов, домены со свежим снапшотом — «already have a snapshot — $0», итог. Если оценка выше бюджета пачки или остатка месячного лимита, кнопка запуска неактивна, а под ней — подсказка с наибольшим числом доменов, которое укладывается, и кнопкой «Trim list to N». Значение выше жёсткого предела поле не принимает и показывает предел.

**Карточка пачки.** Сверху — полоса бюджета: потрачено и остаток. Таблица доменов: домен, статус, скор, упоминания из 10, упоминания главного конкурента, главная находка, стоимость, действия. Статусы: `snapshot ready`, `skipped: budget`, `failed`, `link opened`, `email left`, `upgraded`. По строке раскрывается черновик письма с уже подставленными цифрами и кнопками «Copy», «Mark as sent».

**Настройки бюджета.** Три блока: бюджет домена по умолчанию, бюджет пачки по умолчанию (сумма и число доменов), месячный лимит. Рядом с каждым полем серым — жёсткий предел, его изменить нельзя. Внизу — журнал изменений: кто, когда, поле, старое и новое значение.

**Уведомления** в очереди, а не всплывающие окна: пачка остановлена бюджетом; месяц израсходовал 80% лимита.

### 2.2 S4. Результат Free snapshot в режиме аутрича

Ссылка из письма аутрича ведёт на тот же экран результата S4, что видит посетитель лендинга. Нового экрана нет, есть режим существующего. Снапшот готов заранее, поэтому экран прогресса пропускается.

Отличия режима — только три:
- **Баннер** над результатом: «Prepared for {Company} by GeoTrack» и ссылка «What is this?», объясняющая в двух фразах, откуда результат.
- **Email-гейт** тот же, что во входящем потоке, но после ввода email полная версия открывается сразу, без ожидания.
- **Устаревшая ссылка** — после 30 дней: короткий текст и кнопка «Run a fresh snapshot», ведущая на лендинг с подставленным доменом.

Всё остальное — скор, находки в формате тизера, пример ответа ассистента, карточка апгрейда до стандартного аудита, шеринг — без изменений. Мобильная версия обязательна: ссылки из LinkedIn чаще открывают с телефона.

### 2.3 S1. Лендинг: рынок и язык отчёта

Во встроенную раскрывающуюся панель с категорией и конкурентами добавляются два поля. **Market** — выпадающий список из четырёх вариантов, по умолчанию определяется по языку сайта и домену, с подписью «Buyers' questions are asked in this language». **Report language** — EN или RO, по умолчанию совпадает с языком интерфейса. Панель по-прежнему свёрнута по умолчанию; в свёрнутом виде под полем URL — одна строка «Market: Moldova — Russian · Report: EN · Change».

### 2.4 S8, S9. Выбор тарифа, оплата, цены

**Состав тарифов.** Standard: три движка, 30 вопросов с веб-поиском и 10 без него, один рынок, три конкурента. Extended: 50 вопросов, до трёх рынков, пять конкурентов, 15-минутный разбор. Строки таблицы тарифов на S9 и в карточках выбора на S8 обновляются.

**Вопросы покупателей.** На S8, после выбора тарифа и до оплаты, — необязательный блок «Questions your buyers ask»: до пяти полей, пример в плейсхолдере («We're 5 people with no IT — what should we use instead of spreadsheets?»), подсказка «We'll ask AI assistants these, in your buyers' words». Блок можно свернуть.

**Дополнительные рынки.** Только для Extended: мультивыбор до двух рынков, кроме основного, с подписью «Each extra market gets its own visibility score».

### 2.5 S6, S7, S12. Полный отчёт, находки, PDF

**Блок столпа A** получает индикатор «Known without search»: процент и серая метка «not in score», подсказка по наведению — одна фраза о том, что это знание модели из обучающих данных.

**Новая строка «Visibility breakdown»** после блока столпа A: четыре компактные карточки-сравнения, в каждой две полосы с процентами упоминаний.
- **With search и Without search.**
- **Buyer types:** две-три полосы, целевой тип выделен и подписан «your buyers».
- **Markets:** только в Extended с несколькими рынками; для них ещё и вкладки рынков над столпом A.
- **Your buyers' questions и Category questions.**

Карточка, где меньше шести вопросов, показывает «Not enough questions for a fair comparison» вместо полос.

**Находки разрывов (S7)** — та же карточка находки с меткой «Gap» и названием среза в доказательстве: «Mentioned in 42% of answers with search, 8% without». Действие ведёт к услуге из каталога, как у остальных находок.

**Список вопросов** в приложении отчёта получает метки слоя — «Category», «Brand», «Your buyers» — и метку типа покупателя; у вопросов покупателей — источник: «from your FAQ», «from reviews», «you added», «generated».

**Строка ограничений** под скором: «Asked via official APIs in fresh sessions — answers for signed-in users with memory may differ».

**PDF (S12)** повторяет строку «Visibility breakdown» и метки вопросов; вкладки рынков превращаются в последовательные блоки.

### 2.6 S13. Методология

Три новых раздела и одна строка в ограничениях: «Two ways AI answers» — с поиском и без, и что каждое значит; «Markets and languages» — вопросы задаются на языке рынка, а не переводятся; «Your buyers' questions» — откуда берутся и как помечены. В «What we don't measure» — персонализация и память ассистентов. Числовых весов по-прежнему нет.

---

## 3. Промпты для Claude Design

### 3.1 Д1. Админка: аутрич и бюджеты (S14, правка артбордов 6.16)

```text
Using the Geotrack design system, update the existing admin panel artboards (desktop 1440, light theme, English only, dense operator tool, no illustrations).

1) Navigation: add an "Outreach" section with three screens: Batches, New batch, Budget settings.

2) Run audit form: add a "Market" select with four options: "Global — English", "Moldova — Romanian", "Moldova — Russian", "Romania — Romanian".

3) Batches list: a thin monthly limit bar at the top ("$6 spent · $3 reserved · $20 limit"). Table columns: category, market, domains, budget, spent, skipped by budget, links opened, emails left, upgraded, created. Money right-aligned, tabular figures.

4) New batch: left column — domains (paste a column or upload CSV), category, market, batch budget in dollars, max domains; defaults prefilled from settings. Right column — an estimate panel: category run (or "cached — $0"), snapshot × domains, "already have a snapshot — $0" for domains with a fresh one, total. If the estimate exceeds the batch budget or the remaining monthly limit, the "Launch batch" button is disabled and a hint shows the largest number of domains that fits with a "Trim list to N" button. Inputs above the hard limit are rejected inline, showing the limit.

5) Batch detail: a two-segment budget bar (spent, remaining). Domains table: domain (monospace), status badge, score, "mentioned X/10", top competitor "Y/10", main finding, cost, actions. Status badges: snapshot ready, skipped: budget, failed, link opened, email left, upgraded. Each row expands to an email draft with the numbers filled in and "Copy" and "Mark as sent" buttons.

6) Budget settings: three blocks — default per-domain budget, default batch budget (amount and max domains), monthly limit. Next to each field, in muted text, the hard limit (read-only). Below — a change log table: who, when, field, old value, new value.

7) Queue: add budget notifications as rows, not pop-ups: "Batch 'time-tracking' stopped by budget — 6 domains skipped", "Outreach used 80% of the monthly limit".

Show these states: new batch with the estimate within budget and over budget; batch detail with a mix of statuses; budget settings with a filled change log. No charts beyond the budget bars.
```

### 3.2 Д2. Результат Free snapshot в режиме аутрича (S4, правка)

```text
Using the Geotrack design system, update the free snapshot result artboards (S4, desktop 1440 and mobile 390) with an "outreach" mode. This is the same screen a landing visitor sees — do not redesign it. The snapshot is prepared in advance, so there is no progress screen.

1) Add a slim banner above the result: "Prepared for {Company} by GeoTrack" with a "What is this?" link that opens a short two-sentence explanation.

2) Keep the email gate exactly as in the inbound flow; after the email is entered, the full snapshot opens immediately.

3) Add an expired-link state: short text and a "Run a fresh snapshot" button that opens the landing page with the domain prefilled.

Everything else — score, teaser findings, the engine quote block, the upgrade card to the Standard audit, share — stays unchanged. Show desktop and mobile for: before email, after email, expired link.
```

### 3.3 Д3. Лендинг: рынок и язык отчёта (S1, правка)

```text
Using the Geotrack design system, update the landing page artboards (desktop and mobile). In the inline expandable panel with category and competitors, add two fields: "Market" — a select with "Global — English", "Moldova — Romanian", "Moldova — Russian", "Romania — Romanian", helper text "Buyers' questions are asked in this language"; and "Report language" — a segmented control EN / RO, defaulting to the interface language. When the panel is collapsed, show one summary line under the URL field: "Market: Moldova — Russian · Report: EN · Change". Show the collapsed and expanded states.
```

### 3.4 Д4. Выбор тарифа, оплата, цены (S8, S9, правка)

```text
Using the Geotrack design system, update the plan choice, checkout and pricing artboards.

1) Plan contents. Standard $79: three engines, 30 questions with web search and 10 without, one market, three competitors. Extended $199: 50 questions, up to three markets, five competitors, 15-minute review call. Update the plan cards on the plan choice page and the rows of the pricing table.

2) On the plan choice page, after the plan is selected and before payment, add an optional collapsible block "Questions your buyers ask": up to five text fields, placeholder "We're 5 people with no IT — what should we use instead of spreadsheets?", helper "We'll ask AI assistants these, in your buyers' words".

3) For Extended only, add "Additional markets": a multi-select of up to two markets other than the main one, helper "Each extra market gets its own visibility score".

Show Standard selected with the questions block filled, and Extended selected with two extra markets.
```

### 3.5 Д5. Полный отчёт, находки, PDF (S6, S7, S12, правка)

```text
Using the Geotrack design system, update the full report, finding card and PDF artboards.

1) Pillar A block: add an indicator "Known without search: 12%" with a muted tag "not in score" and a tooltip "What the model knows about you from its training data, without looking anything up".

2) After the pillar A block, add a row "Visibility breakdown" with four compact comparison cards, each with two or three horizontal bars and percentages: "With search / Without search"; "Buyer types" (2–3 bars, the target type highlighted and labelled "your buyers"); "Markets" (Extended with several markets only); "Your buyers' questions / Category questions". A card with fewer than six questions shows "Not enough questions for a fair comparison" instead of bars. For Extended with several markets, add market tabs above pillar A.

3) Finding card: add a "Gap" tag variant; evidence reads like "Mentioned in 42% of answers with search, 8% without"; the action links to a service as in other findings.

4) Questions appendix: add layer tags "Category", "Brand", "Your buyers", a buyer type tag, and for buyer questions a source label: "from your FAQ", "from reviews", "you added", "generated".

5) Under the score, one muted line: "Asked via official APIs in fresh sessions — answers for signed-in users with memory may differ."

6) PDF: repeat the breakdown row and the question tags; market tabs become sequential blocks.

Show the report for Standard (one market) and Extended (three markets), and one Gap finding card.
```

### 3.6 Д6. Методология (S13, правка)

```text
Using the Geotrack design system, update the methodology page. Add three sections in the existing text style: "Two ways AI answers" (with web search and from training data, and why we measure them separately); "Markets and languages" (questions are written in the buyers' language for each market, never translated); "Your buyers' questions" (where they come from and how they are labelled in the report). In "What we don't measure", add personalization and assistant memory. No numeric weights.
```

---

## 4. Критерии приёмки

- Во всех новых элементах интерфейса рынок называется «Market», русский язык есть только в списке рынков, а не в переключателе языка интерфейса.
- Режим аутрича на S4 отличается от входящего потока только баннером, мгновенным открытием после email и состоянием устаревшей ссылки; скор, находки и апгрейд — те же компоненты.
- Режим аутрича есть в десктопной и мобильной версии.
- В админке кнопка запуска пачки неактивна при оценке выше бюджета, и рядом всегда есть подсказка, сколько доменов укладывается.
- Жёсткие пределы бюджета показаны рядом с полями и не редактируются.
- Карточки среза с выборкой меньше шести вопросов не показывают полосы.
- Метка «not in score» стоит рядом с индикатором «Known without search» везде, где он встречается, включая PDF.
- Румынские строки новых кнопок и меток помещаются без переноса на S1, S4, S8.

---

## 5. Как влить в бриф 2.1

При следующей сборке брифа: разделы 2.1–2.6 этого дополнения — в спецификации соответствующих экранов раздела 5, режим аутрича — в спецификацию S4; промпты Д1–Д6 — в раздел 6 как правки к промптам своих экранов; критерии — в раздел 7. Новых экранов в карте экранов нет. Номера промптов в брифе 2.1 здесь не используются, чтобы не разойтись с его нумерацией.

---

**Статус**: готово к передаче в Claude Design  
**Последнее обновление**: 25 сентября 2026  
**Следующий пересмотр**: после первых макетов раздела Outreach и режима аутрича на S4
