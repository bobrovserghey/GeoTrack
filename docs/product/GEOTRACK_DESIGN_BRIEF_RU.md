# Geotrack — лучшие практики дизайна и техническое задание для Claude Design

Дата: 2026-09-03. Версия 1.1. Проект: GEO. Автор: Serghey (ProDuck:t Space) при участии Claude. Связанные документы: GEOTRACK_PRODUCT_CONCEPT_RU.md, GEOTRACK_AUDIT_METHODOLOGY_RU.md, GEOTRACK_MVP_AND_ARCHITECTURE_RU.md.

## Резюме

Документ собирает практики дизайна сервисов класса «введи URL — получи оценку» (HubSpot Website Grader и AI Search Grader, Semrush, Ahrefs, Otterly, Profound, Peec, PageSpeed Insights, Mozilla Observatory, SSL Labs и другие), выводит из них принципы для Geotrack и превращает их в техническое задание для Claude Design: карта экранов MVP, дизайн-направление, спецификация каждого экрана, готовые промпты и критерии приёмки.

**Ключевые предположения**:
- Интерфейс, отчёт и письма на английском и румынском; макеты делаются на английском, но с запасом ширины под румынские строки (в среднем на 20–30% длиннее); документация — на русском.
- Публичные страницы (лендинг, отчёт, методология) — светлая тема; админка — не приоритет дизайна.
- Claude Design используется для макетов экранов и дизайн-системы, вёрстка — Claude Code на shadcn/ui и Tailwind, поэтому макеты должны ложиться на эти компоненты.

**Рекомендация**: делать дизайн вокруг трёх вещей, которые отличают Geotrack от бесплатных грейдеров — доказательства в каждой находке, честная неопределённость скора и корзина исправлений как естественное продолжение отчёта.

**Статус**: готово к использованию; промпты для Claude Design — версия 1.0, уточняются после первых макетов.

---

## 1. Что делают референсы и чему у них учиться

| Продукт | Что делает хорошо | Что делает плохо |
|---|---|---|
| HubSpot Website Grader | Одно поле в hero, кольцевой скор 0–100, четыре категории с проверками «прошёл / не прошёл» и понятным «как исправить» | Рекомендации общие, доказательств нет |
| HubSpot AI Search Grader | Веса пяти измерений показаны прямо на странице; короткая форма после анализа, до результата — пользователь уже вложил время | Не видно, какие промпты задавались и что ответили движки; скор скачет между запусками; нет истории |
| Semrush AI Visibility Checker | Без регистрации, три запуска в день; охват по движкам, цитируемые страницы, сравнение с конкурентами бок о бок | Один экран без плана действий |
| Semrush Site Audit | Эталон для находок: Errors / Warnings / Notices, приоритет по влиянию и числу страниц, раскрытие «почему и как исправить», скрыть находку и пересчитать, отправка в трекер задач, брендированный PDF | Плотно, требует привыкания |
| Ahrefs AI Visibility Checker | Доверие через масштаб данных в hero («464M+ промптов»), честный «разовый снимок» с апгрейдом до трендов | Нет рекомендаций |
| Otterly | Столпы разбиты на отдельные мини-инструменты (GEO Content Check, AI Crawlability Test) — каждый ловит свой поисковый спрос | Поверхностно |
| Profound | Показывает реальные ответы ассистентов с подсветкой бренда и источников — доказательство первично | «Дашборды осваиваются неделями» |
| Peec AI | Самый чистый интерфейс: видимость в процентах, позиция, тональность, тип источника, конкуренты слоями | Нет рекомендаций — главная претензия пользователей |
| Am I on AI | Буквенная оценка с диапазонами, «% влияния» у каждого действия | Лендинг требует email сразу |
| PageSpeed Insights / Lighthouse | Три цветовые полосы с разными глифами (не только цвет), «Opportunities» с оценкой выигрыша, «Passed audits» свёрнуты, «относитесь к скору как к распределению» | Термины для разработчиков |
| Mozilla Observatory | Буква плюс балл, таблица тестов со штрафом за каждый, все рекомендации сразу, публичная история сканов | Только для технарей |
| SSL Labs | Объяснение ограничения: «оценка ограничена B, потому что…» — модель для «почему у вас не 9» | Устаревший визуал |

Что из этого следует для Geotrack: измерение без действий — главная претензия к рынку, а непрозрачный скор — главная претензия к HubSpot. Значит, у нас каждая находка с доказательством, промпты и ответы видны, скор объясняет, что его ограничило, и от каждой находки один клик до исправления.

---

## 2. Принципы дизайна Geotrack

1. **Одно поле, один призыв.** На лендинге ничего не отвлекает от поля URL. Регистрации нет; email просят после того, как показали ценность.
2. **Показываем работу.** Экран прогресса — не спиннер, а живая лента конкретных действий и первых находок (эффект «видимого труда»: показанная работа повышает воспринимаемую ценность даже при большем ожидании).
3. **Доказательство рядом с каждым баллом.** Цитата ответа ассистента с подсветкой бренда, строка robots.txt, HTTP-код, скриншот. Без артефакта находки нет.
4. **Скор объясняет себя.** Большая цифра 0–10 с одной десятой, словесная полоса, диапазон «в 6 из 20 прогонов», маркер медианы категории и явное «что ограничило оценку».
5. **Длина, а не угол.** Одна кольцевая шкала для главного числа, столпы — горизонтальные полосы с маркером бенчмарка: длины сравниваются точнее, чем дуги.
6. **Цвет плюс форма.** Три полосы (низко, средне, высоко) с разной яркостью и глифами; статусы никогда не кодируются только цветом (WCAG 1.4.1).
7. **Действие в один клик.** У каждой находки три варианта: сделать самому (инструкция с кодом), добавить в корзину исправлений (цена и прогноз скора), отслеживать. Корзина — продолжение отчёта, а не рекламный блок.
8. **Замок вместо пустоты.** Платные секции показываются размытыми с реальной структурой, а не скрываются: видимое-но-закрытое конвертирует лучше.
9. **Пройденные проверки видны.** Свёрнутый список «что уже хорошо» повышает доверие к скору.
10. **Спокойный визуал.** Много воздуха, типографика задаёт иерархию, один акцентный цвет, тонкая анимация; никакого «AI-глянца» с градиентами и свечением.

---

## 3. Карта экранов MVP

| Экран | Задача | Приоритет |
|---|---|---|
| S1. Лендинг с полем URL | Получить URL, объяснить ценность за пять секунд | Высший |
| S2. Окно выбора категории | Уточнить категорию при низкой уверенности модели | Высший |
| S3. Экран прогресса | Удержать 1–3 минуты, показать работу, собрать email через «пришлите ссылку» | Высший |
| S4. Результат тизера | Показать скор, столпы, три находки; закрытые секции; призыв к полному аудиту | Высший |
| S5. Карточка для шеринга (OG-изображение) | Вирусность в LinkedIn и Slack | Высокий |
| S6. Полный отчёт | Все столпы, до 15 находок, доказательства, корзина исправлений | Высший |
| S7. Карточка находки | Единый формат семи полей с раскрытием | Высший |
| S8. Корзина исправлений и оплата | Собрать услуги, показать прогноз скора, оплатить | Высокий |
| S9. Блок цен | Разовый аудит, мониторинг (лист ожидания), услуги | Высокий |
| S10. Переключатель языка и румынская версия | Переключение en / ro в шапке, проверка ширины строк на S1, S4, S6 | Средний |
| S11. Письма | Результат тизера, отчёт готов, одна находка через сутки | Средний |
| S12. PDF отчёта | Печатная версия для руководства | Средний |
| S13. Страница методологии | Доверие: веса, движки, ограничения | Средний |
| S14. Админка | Список аудитов, артефакты, перезапуск | Низкий, без дизайна |

---

## 4. Дизайн-направление

### 4.1 Характер

Спокойный инструмент для маркетолога и фаундера, а не «AI-магия». Ориентиры по ощущению: Linear (типографика и воздух), Stripe (прогрессивное раскрытие), Vercel (один призыв на экран), PostHog (данные без украшательств). Никаких абстрактных «нейросетевых» иллюстраций, свечений и радужных градиентов.

### 4.2 Тема и сетка

Публичные страницы — светлая тема как основная, тёмная — поддерживается токенами. Контейнер 1200 px, сетка 12 колонок, отступы кратны 4 px, шкала 8 / 12 / 16 / 24 / 32 / 48 / 64. Мобильная версия обязательна для S1, S3, S4, S6: скор, полосы столпов, три главные находки, свёрнутые секции, липкая кнопка «Get full report».

### 4.3 Типографика

Один шрифт с широким набором начертаний (Inter, Geist или аналог), моноширинный для кода, URL и промптов (JetBrains Mono или Geist Mono). Скор — крупная цифра с табличными цифрами, чтобы не прыгала ширина. Иерархия за счёт размера и веса, а не цвета.

### 4.4 Цвет и семантика

Нейтральная база (серые с лёгким холодным оттенком), один акцент для действий (глубокий синий или индиго), три семантических состояния оценки с разной яркостью и глифом:

| Полоса | Диапазон скора | Цвет | Глиф |
|---|---|---|---|
| Низко | 0–4,9 | Красно-оранжевый, тёмный | Треугольник |
| Средне | 5–6,9 | Янтарный | Квадрат |
| Высоко | 7–10 | Зелёный, приглушённый | Круг |

Контраст текста не ниже 4,5:1, нетекстовых элементов — 3:1. Столпы, конкуренты и движки различаются не оттенками одного цвета, а формой и подписями.

### 4.5 Компоненты (на базе shadcn/ui)

Поле URL с валидацией и подсказкой домена; кнопка основного действия; кольцевой индикатор скора; горизонтальная полоса столпа с маркером медианы; чип полосы оценки; чип серьёзности, усилий и влияния; карточка находки с раскрытием; блок доказательства (цитата ответа с подсветкой бренда, код, скриншот); лента прогресса (шаг, статус, результат); размытая закрытая секция с замком; корзина исправлений с итогом и прогнозом; таблица сравнения с конкурентами; карточка тарифа; toast, skeleton, пустые состояния, состояние ошибки («сайт недоступен», «это не веб-приложение», «лимит на домен»).

### 4.6 Движение

Прогресс: строки ленты появляются снизу с задержкой 150–250 мс, числа столпов «докручиваются» при первом показе (400 мс), раскрытие карточек — 200 мс. Никаких бесконечных анимаций на экране отчёта.

### 4.7 Доступность

WCAG 2.2 AA: цели касания 24×24 px, фокус не перекрывается липкими шапками, нет действий только перетаскиванием, URL и email не запрашиваются повторно, все состояния читаются без цвета, клавиатурная навигация по карточкам.

---

## 5. Спецификации экранов

### 5.1 S1. Лендинг

Верх: логотип, ссылки «Methodology», «Pricing», переключатель языка EN / RO, кнопка «Run free audit». Hero на одну мысль: заголовок про то, что покупатели спрашивают ChatGPT, подзаголовок про оценку 0–10 и план исправлений, поле URL с кнопкой «Check my visibility», под полем — «Free · No signup · 2 minutes». Рядом с полем свёрнутая ссылка «Add category and competitors» с двумя необязательными полями. Ниже — живой пример результата (настоящий скор реального сайта, с разрешения владельца), три шага «как это работает», пять столпов одной строкой с иконками-глифами, блок доверия (методология открыта, промпты видны, движки названы), цены, FAQ, подвал. Turnstile невидим.

Состояния поля: пустое, ввод, ошибка формата, домен недоступен, лимит «этот домен проверяли за последние 30 дней — вот результат», отправка.

### 5.2 S2. Окно выбора категории

Модальное окно после разведки сайта: «What category is {product}?», три предложенных варианта карточками с одной строкой описания, поле поиска по таксономии, ссылка «None of these» (ввод свободного текста), кнопка «Continue». Показывается только при уверенности ниже порога; прогресс за окном продолжается.

### 5.3 S3. Экран прогресса

Слева — пять строк столпов со статусами (ожидание, идёт, готово с превью-цифрой), справа — живая лента конкретных событий: «Reading pricing page…», «Found robots.txt: ClaudeBot blocked», «Asked Perplexity: best time-tracking tools for agencies — you are not mentioned, Toggl and Harvest are». Сверху оценка времени «Usually 2–4 minutes» (округлять вверх, пересматривать только вниз). Под лентой — поле «Email me the link when it's ready» как естественный сбор email без давления. Скелет отчёта проступает под лентой по мере готовности столпов. Ошибка шага не ломает экран: строка помечается «partial», объяснение в одну фразу.

### 5.4 S4. Результат тизера

Hero результата: кольцевой скор с одной десятой и словесной полосой («4.2 — Mentioned occasionally»), под ним «Preliminary: based on 12 prompts in 1 engine», справа маркер «Median in your category: 4.6». Далее пять полос столпов с бенчмарком; два столпа (A частично, B полностью) с реальными значениями, остальные — размытые с замком и подписью «Unlocked in the full audit». Три карточки находок (S7) в полном формате. Один пример ответа ассистента с подсветкой конкурентов и отсутствием бренда. Блок «Share your score» с превью карточки S5 и кнопками копировать ссылку, LinkedIn. Липкий призыв «Get the full audit — $79»: список того, что откроется (30 промптов, 3 движка, 5 конкурентов, 15 находок, план исправлений). Email-гейт: если email не собран на S3, поле показывается перед brand-промптами с формулировкой «We'll run 3 more checks about your brand and send the link».

### 5.5 S5. Карточка для шеринга

OG-изображение 1200×630: логотип, домен, крупный скор и полоса, пять мини-полос столпов, «vs category median», дата и подпись «Geotrack AI visibility audit». Тёмный фон допустим только здесь — карточка живёт в чужих лентах.

### 5.6 S6. Полный отчёт

Структура сверху вниз: шапка с доменом, датой, версией методологии, кнопками «Share», «PDF», «Re-run»; hero скора с интервалом «4.2 (3.9–4.5)» и блоком «What capped your score» (одна-две строки в стиле SSL Labs); пять полос столпов с медианой и кликом в раздел; таблица «You vs competitors» (упоминания, цитаты, позиция по пяти конкурентам); секции по столпам, каждая — короткий вывод, список находок, свёрнутые «Passed checks»; сводный «Fix plan»: Quick wins (до четырёх часов) и Strategic initiatives, каждая строка с влиянием и усилиями; корзина исправлений (S8) закреплена справа на десктопе и внизу на мобильном; приложение: все промпты и ответы по движкам с фильтром, артефакты. Навигация — липкое оглавление слева на десктопе.

### 5.7 S7. Карточка находки

Шапка: чип серьёзности (Critical, Warning, Notice), чип влияния («−0.6 score»), чип усилий («30 min · DevOps»), метка столпа и критерия (B2). Заголовок — одна фраза проблемы. Тело: блок доказательства (тип зависит от столпа: цитата ответа с подсветкой, фрагмент robots.txt или HTTP-ответ моноширинным, скриншот, таблица источников). Раскрытие «How to fix»: шаги, код с кнопкой копирования, ссылка «Learn more». Подвал: три действия — «Fix it myself» (открывает инструкцию), «Add to fix-it cart — $299» (с прогнозом «+0.5–0.8»), «Track in monitoring» (лист ожидания в MVP); «Mark as not applicable» пересчитывает скор с пометкой.

### 5.8 S8. Корзина исправлений и оплата

Панель: список выбранных услуг с ценой и прогнозом, итог «Projected score: 4.2 to 6.1», сумма, срок, кнопка «Order fixes». Шаг оплаты: одна страница — состав, реквизиты через Paddle Checkout, что произойдёт дальше (созвон 15 минут, срок, ре-аудит после исполнения). Для услуг с заявкой вместо оплаты — форма и Cal.com.

### 5.9 S9. Цены

Три карточки в ряд: «Full audit — $79, one-time» (по центру, выделена), «Monitoring — from $49/mo, join waitlist», «Done-for-you fixes — from $299, per finding». Под каждой — список включённого, снятие возражений рядом с кнопкой (возврат, без подписки, сколько времени занимает), FAQ ниже. На мобильном карточки стопкой, липкая кнопка.

### 5.10 S10. Переключатель языка и румынская версия

Переключатель en / ro в шапке рядом с кнопкой действия, запоминание выбора, автоопределение по языку браузера с возможностью сменить. Все строки интерфейса — из файлов локализации; в макетах проверяются самые длинные румынские варианты для кнопок, чипов и заголовков карточек. Отчёт и письма генерируются на языке аудита, промпты для румынского рынка — на румынском.

### 5.11 S11. Письма

Три письма в едином шаблоне на светлом фоне: результат тизера (скор, три находки, кнопка), отчёт готов (скор, «что ограничило», кнопка), через сутки — одна находка с инструкцией и одной услугой. Без изображений, кроме карточки скора; читаемо в тёмной теме почтовых клиентов.

### 5.12 S12. PDF

Обложка: домен, скор, дата, версия методологии. Далее содержимое S6 в печатной раскладке: A4, поля 18 мм, карточки не рвутся между страницами, заголовки таблиц повторяются, ссылки печатаются текстом, графики в SVG, светлая тема.

### 5.13 S13. Методология

Текстовая страница: пять столпов с весами и критериями, список движков и способ опроса, как считается интервал, что ограничивает оценку, что не оцениваем. Это страница доверия и одновременно контент для цитирования ассистентами.

---

## 6. Промпты для Claude Design

Промпты на английском — так Claude Design точнее подбирает компоненты и типографику. Первый промпт создаёт дизайн-систему, остальные ссылаются на неё. Каждый промпт запускать отдельной сессией, макеты сохранять в `final files/GEO/design`.

### 6.1 Дизайн-система

```text
Create a design system for "Geotrack", a B2B SaaS tool that audits how visible a web app is in AI assistants (ChatGPT, Perplexity, Gemini) and scores it 0–10.

Feel: calm, precise, trustworthy analytics tool for founders and marketing leads. References: Linear (typography, whitespace), Stripe (progressive disclosure), Vercel (one CTA per screen), PostHog (data without decoration). No AI-glow gradients, no abstract neural illustrations.

Tokens: light theme primary, dark theme supported. Neutral cool greys; one accent (deep indigo) for actions only. Three score bands with distinct luminance AND a glyph, never colour alone: Low 0–4.9 (dark red-orange, triangle), Mid 5–6.9 (amber, square), High 7–10 (muted green, circle). Text contrast 4.5:1, non-text 3:1.

Type: Inter or Geist for UI, Geist Mono or JetBrains Mono for code, URLs and prompts. Score numerals large with tabular figures. Spacing scale 4/8/12/16/24/32/48/64, 12-col grid, 1200px container.

Components to define (shadcn/ui compatible): URL input with validation states; primary button; score ring (single hero use) with band label; pillar bar (horizontal) with a median marker; band chip; severity chip (Critical/Warning/Notice); impact chip ("−0.6 score"); effort chip ("30 min · DevOps"); finding card with expandable "How to fix" and code block with copy; evidence block variants (quoted AI answer with brand highlight, monospace HTTP/robots snippet, screenshot, source table); progress feed row (pending/running/done/partial); locked section (blurred real content + lock + one-line unlock copy); fix-it cart panel with projected score; competitor comparison table; pricing card; toast, skeleton, empty and error states.

Motion: feed rows slide in 150–250 ms, numbers count up once (400 ms), card expand 200 ms. No looping animations on report pages.

Accessibility: WCAG 2.2 AA, 24×24 targets, visible focus not hidden by sticky headers, keyboard navigation through cards.

Output: token sheet, typography scale, colour semantics with band glyphs, and one artboard per component with all states, light and dark.
```

### 6.2 Лендинг (S1)

```text
Using the Geotrack design system, design the landing page (desktop 1440 and mobile 390).

Nav: logo, Methodology, Pricing, language switcher (EN / RO), button "Run free audit".
Hero (one idea): H1 "Your buyers ask ChatGPT. Does it recommend you?"; subhead "Enter your web app URL and get a 0–10 AI visibility score with evidence and a fix plan."; URL input + button "Check my visibility"; microcopy "Free · No signup · about 2 minutes"; collapsed link "Add category and competitors (optional)" revealing two fields.
Below hero: a real sample result card (score 4.2, band Mid, five pillar bars with median markers) labelled "Live example from a real audit (with permission)"; three steps "Paste URL → We ask ChatGPT, Perplexity and Gemini 30+ buyer questions → You get a score, evidence and fixes" (render as three cards, no emoji); five pillars row with glyph icons and one-line descriptions: Answer Visibility, AI Crawlability, Content Citability, Entity & Authority, Agent-Readiness; trust block: "Open methodology", "You see every prompt and answer", "Engines named, not hidden"; pricing section (three cards, middle "Full audit $79" highlighted); FAQ (6 items); footer.
States for the input: empty, typing, invalid URL, site unreachable, "This domain was checked 12 days ago — see the result", submitting.
Tone: plain, confident, no hype words.
```

### 6.3 Окно категории и экран прогресса (S2, S3)

```text
Using the Geotrack design system, design two screens.

1) Category modal: title "What category is Acme?"; three suggested category cards (name + one-line description, e.g. "Time tracking for agencies"); search field "Search 200 categories"; link "None of these"; button "Continue". Show it over a dimmed progress screen that keeps running behind.

2) Progress screen (desktop and mobile): header "Auditing acme.com" with estimate "Usually 2–4 minutes". Left column: five pillar rows with status (pending / running with spinner / done with preview number / partial with one-line reason). Right column: live feed of concrete events, newest at bottom, monospace for URLs and prompts, e.g. "Reading /pricing…", "robots.txt: ClaudeBot and PerplexityBot are blocked", "Asked Perplexity: 'best time tracking tools for agencies' — you are not mentioned; Toggl, Harvest, Clockify are". Below the feed: inline field "Email me the link when it's ready" with button "Notify me". A faint skeleton of the report layout appears beneath as pillars complete. Show states: 20%, 60%, one partial pillar, and completed transition.
```

### 6.4 Результат тизера и карточка для шеринга (S4, S5)

```text
Using the Geotrack design system, design the free teaser result page (desktop and mobile) and the share image.

Result hero: score ring "4.2" with band label "Mentioned occasionally", caption "Preliminary · 12 prompts · 1 engine", benchmark "Category median 4.6". Five pillar bars: Answer Visibility and AI Crawlability with real values and median markers; Content Citability, Entity & Authority and Agent-Readiness rendered as locked sections — blurred but structurally real, lock icon, copy "Unlocked in the full audit".
Three finding cards in full format (severity, impact, effort chips; one-line problem; evidence block; expandable How to fix; footer actions "Fix it myself", "Add to fix-it cart — $299", "Track"). Example findings: "PerplexityBot gets 403 from Cloudflare", "Your pricing page is not indexed in Bing", "Not mentioned in 11 of 12 discovery prompts; Toggl in 9".
One quoted AI answer block with competitor names highlighted and a note "Your brand: not mentioned".
Share block: preview of the share card, buttons "Copy link", "Share on LinkedIn".
Sticky CTA bar: "Get the full audit — $79" with a compact list: 30 prompts · 3 engines · 5 competitors · up to 15 findings · fix plan.
Email gate variant: if no email yet, an inline card before the brand checks: "We'll run 3 more checks about your brand and send you the link" with email field.

Share image 1200×630: logo, domain, big score with band glyph, five mini pillar bars, "vs category median 4.6", date, "Geotrack AI visibility audit". Dark background allowed here only.
```

### 6.5 Полный отчёт и карточка находки (S6, S7)

```text
Using the Geotrack design system, design the full audit report page (desktop 1440, mobile 390) for acme.com.

Header: domain, date, "Methodology v1.0", buttons Share, PDF, Re-run. Sticky left table of contents on desktop.
Score hero: "4.2" with interval "(3.9–4.5)", band label, benchmark marker, and a "What capped your score" box with two lines, e.g. "AI Crawlability is capped at 30/100: two of five engines are blocked at the CDN" and "Agent-Readiness capped at 40/100: the agent could not find pricing in 3 of 3 attempts".
Pillar bars with medians; each bar links to its section.
"You vs competitors" table: five competitors × mentions %, citations %, avg position, sentiment; brand row highlighted.
Sections per pillar: one-paragraph takeaway, finding cards, collapsed "Passed checks (7)".
"Fix plan": two groups, Quick wins (under 4 hours) and Strategic initiatives; rows with impact and effort chips and a checkbox to add to the cart.
Fix-it cart: right rail on desktop, bottom sheet on mobile; items with price and projected gain, total, "Projected score 4.2 → 6.1", button "Order fixes".
Appendix: prompts and answers per engine with filters (engine, prompt type, mentioned / not mentioned), evidence artefacts.
Also produce a dedicated artboard for the finding card with all states: collapsed, expanded, added to cart, marked not applicable (score recalculated note), and all four evidence variants.
```

### 6.6 Корзина, оплата, цены (S8, S9)

```text
Using the Geotrack design system, design: (1) the fix-it cart panel with three items (AI Crawl Fix $299 "+0.5–0.8", Citable Content Pack $1,190 "+0.6–1.0", Entity Kit $390 "+0.2–0.4"), projected score line, total, ETA, button "Order fixes"; (2) a one-page checkout: order summary, Paddle-hosted payment block placeholder, "What happens next" (15-min call, timeline, re-audit after delivery), guarantee line; (3) a variant where an item is "request a quote" with a short form and a Cal.com slot picker; (4) the pricing section with three cards — "Full audit $79 one-time" highlighted in the middle, "Monitoring from $49/mo — join waitlist", "Done-for-you fixes from $299 per finding" — each with included items, objection-removers next to the button, FAQ below; mobile stacked with sticky CTA.
```

### 6.7 Языковой переключатель, письма, PDF, методология (S10–S13)

```text
Using the Geotrack design system, design: (1) a language switcher (EN / RO) in the header and the Romanian variant of the landing hero, teaser result and one finding card, checking that longer Romanian strings fit buttons, chips and card titles; (2) three transactional emails in one light template — teaser result (score, three findings, button), report ready (score, what capped it, button), one finding a day later (problem, fix, one service) — text-first, one score card image, dark-mode safe; (3) a print layout of the report: A4, 18 mm margins, cover page (domain, score, date, methodology version), cards never split across pages, repeating table headers, links printed as text; (4) a methodology page: five pillars with weights and criteria, engines and how we query them, how the interval is computed, what caps a score, what we do not measure.
```

---

## 7. Критерии приёмки макетов

- Каждый экран есть в десктопной и мобильной версии; для S1, S3, S4, S6 — все состояния из спецификации.
- Ни один статус или полоса оценки не читается только цветом; контраст проверен.
- На S4 и S6 у каждой находки виден блок доказательства и три действия.
- Скор нигде не показан без словесной полосы; в полном отчёте — с интервалом и «что ограничило».
- Закрытые секции показывают реальную структуру, а не пустой замок.
- Один основной призыв на экран; на S1 нет второго конкурирующего действия.
- Все компоненты сводимы к shadcn/ui и Tailwind без кастомных библиотек графиков (полосы и кольцо — SVG).
- Нет эмодзи, «AI-свечения», абстрактных иллюстраций.
- Тексты на английском, простые, без слов «revolutionary», «powerful», «unlock the power».

---

## 8. Выводы

Рынок уже научил пользователей вводить URL и ждать оценку; проигрывают те, кто даёт цифру без причин и без действий. Дизайн Geotrack строится вокруг доказательств в каждой находке, честного скора с интервалом и объяснением ограничений и корзины исправлений как продолжения отчёта. Техническое задание выше даёт Claude Design последовательность из семи промптов: дизайн-система, затем экраны в порядке воронки. Следующий шаг — прогнать промпт 6.1 и 6.2, посмотреть на макеты и уточнить токены до того, как двигаться к отчёту.

---

**Статус**: готово к использованию, промпты — версия 1.0  
**Последнее обновление**: 3 сентября 2026  
**Следующий пересмотр**: после первых макетов дизайн-системы и лендинга

---

## Приложение. Источники

- HubSpot AI Search Grader — https://www.hubspot.com/ai-search-grader ; обзоры: https://reachroller.com/blog/hubspot-ai-search-grader-review ; https://www.stackmatix.com/blog/hubspot-ai-search-grader
- HubSpot Website Grader — https://www.properexpression.com/growth-marketing-blog/hubspot-website-grader ; https://outgrow.co/blog/hubspot-website-grader-case-study
- Semrush AI Search Visibility Checker — https://www.semrush.com/free-tools/ai-search-visibility-checker/ ; метрики — https://www.semrush.com/kb/1594-ai-seo-metrics ; Site Audit — https://www.semrush.com/kb/541-site-audit-issues-report ; https://www.semrush.com/kb/540-site-audit-overview
- Ahrefs AI Visibility Checker — https://ahrefs.com/ai-visibility-checker
- Otterly GEO tools — https://otterly.ai/geo-tools/
- Profound vs Peec — https://openlens.com/blog/en/profound-vs-peec ; https://www.tryprofound.com/blog/peec-ai-review
- Am I on AI — https://www.amionai.com/ ; Rankscale — https://rankscale.ai/
- Lighthouse scoring — https://developer.chrome.com/docs/lighthouse/performance/performance-scoring ; PageSpeed Insights — https://www.debugbear.com/blog/pagespeed-insights
- Mozilla HTTP Observatory — https://developer.mozilla.org/en-US/blog/mdn-http-observatory-launch/ ; SSL Labs — https://gcore.com/learning/how-to-get-a-plus-ssllabs
- Neil Patel SEO Analyzer — https://neilpatel.com/seo-analyzer/ ; Seobility — https://www.seobility.net/en/seocheck/ ; обзор грейдеров — https://foglift.io/blog/best-website-grader-2026
- Индикаторы прогресса — https://www.uxtigers.com/post/progress-indicators ; https://www.pencilandpaper.io/articles/ux-pattern-analysis-loading-feedback ; эффект видимого труда — https://www.forbes.com/sites/rogerdooley/2025/02/04/labor-illusion-why-brands-should-show-their-work-even-if-its-not-real/
- Полосы против шкал-циферблатов — https://www.tableau.com/blog/bullet-graphs-beat-gauge-charts ; https://www.nngroup.com/videos/data-visualizations-dashboards/
- Отображение неопределённости — https://www.frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2026.1869108/full
- Цвет и доступность — https://www.accessibility.chat/articles/when-color-coding-fails-why-status-indicators-need-more-than-pretty-colors ; https://webaim.org/articles/contrast/ ; WCAG 2.2 — https://www.audioeye.com/post/wcag-22/
- Конверсия лид-магнитов — https://www.digitalapplied.com/blog/lead-magnet-conversion-benchmarks-2026-b2b-data-reference ; страницы цен — https://fungies.io/saas-pricing-page-best-practices-2026/
- Тренды SaaS UI 2026 — https://www.saasui.design/blog/7-saas-ui-design-trends-2026 ; печать в PDF — https://pdf4.dev/blog/css-print-styles-pdf-guide
