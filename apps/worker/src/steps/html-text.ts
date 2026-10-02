/**
 * Видимый текст сырого HTML.
 *
 * Разбор однопроходный и на `indexOf`, без регулярок: прежние ленивые
 * `/<script[\s\S]*?<\/script>/gi` и жадная `/<[^>]+>/g` давали на недоверенном HTML
 * O(n²) и синхронно блокировали event loop воркера (1 МБ с 20k незакрытых `<script` —
 * ~9 с). Сравнение идёт прямо по `html`, без параллельной строки в нижнем регистре:
 * `toLowerCase()` может УДЛИНИТЬ строку (`U+0130` `İ` → `i` + `U+0307`), после чего
 * индексы одной строки перестают соответствовать срезам другой.
 */

/**
 * Элементы, содержимое которых не является видимым текстом и вырезается целиком.
 * `noscript` сюда НЕ входит: это ровно то, что видит агент без JS.
 */
const INERT_ELEMENTS = ['script', 'style', 'template'] as const;

/** HTML-пробелы (whitespace по спецификации HTML5). */
function isHtmlSpace(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';
}

/**
 * Регистронезависимое сравнение с ASCII-строчным именем тега в позиции `at`.
 * Имена в `INERT_ELEMENTS` — только `a-z`, у них бит 0x20 выставлен, поэтому
 * `code | 0x20` сводит к имени ровно две буквы (`S` и `s`) и ничего больше.
 */
function matchesTagName(html: string, name: string, at: number): boolean {
  if (at + name.length > html.length) return false;
  for (let i = 0; i < name.length; i++) {
    if ((html.charCodeAt(at + i) | 0x20) !== name.charCodeAt(i)) return false;
  }
  return true;
}

/** Имя инертного элемента, открывающегося в позиции `lt`, либо null. */
function inertElementAt(html: string, lt: number): string | null {
  for (const name of INERT_ELEMENTS) {
    if (!matchesTagName(html, name, lt + 1)) continue;
    const after = html[lt + 1 + name.length];
    // Граница имени тега: `<script>`, `<script src=…>`. `/` границей НЕ считается:
    // самозакрывающаяся форма `<script/>` снимается как обычный тег и не съедает
    // остаток документа (обнуление видимого текста опаснее лишнего текста).
    if (after === '>' || isHtmlSpace(after)) return name;
  }
  return null;
}

/**
 * Конец закрывающего тега `</name…>` начиная с `from`, либо null (тег не закрыт).
 * HTML5 допускает пробелы перед `>`, поэтому `</script >` тоже распознаётся.
 */
function findCloseTagEnd(html: string, name: string, from: number): number | null {
  let i = from;
  for (;;) {
    const found = html.indexOf('</', i);
    if (found === -1) return null;
    const nameEnd = found + 2 + name.length;
    if (matchesTagName(html, name, found + 2)) {
      const after = html[nameEnd];
      if (after === '>') return nameEnd + 1;
      if (isHtmlSpace(after)) {
        const gt = html.indexOf('>', nameEnd);
        return gt === -1 ? null : gt + 1;
      }
      // `</scriptural…` — не закрывающий тег, продолжаем поиск.
    }
    i = found + 2;
  }
}

/**
 * Конец комментария, открытого в позиции `lt` (`<!--`), либо null (не закрыт).
 * `<!-->` и `<!--->` по HTML5 — ЗАВЕРШЁННЫЕ комментарии
 * (abrupt-closing-of-empty-comment), поэтому их нельзя искать как `-->` после `lt + 4`.
 */
function findCommentEnd(html: string, lt: number): number | null {
  if (html[lt + 4] === '>') return lt + 5;
  if (html[lt + 4] === '-' && html[lt + 5] === '>') return lt + 6;
  const end = html.indexOf('-->', lt + 4);
  return end === -1 ? null : end + 3;
}

/**
 * Линейное снятие разметки: комментарии, инертные элементы, теги.
 *
 * Незакрытый инертный элемент или комментарий «съедает» остаток документа — так же
 * ведёт себя HTML-парсер, иначе тело скрипта утекает в «видимый текст».
 */
function stripMarkup(html: string): string {
  let out = '';
  let pos = 0;

  for (;;) {
    const lt = html.indexOf('<', pos);
    if (lt === -1) return out + html.slice(pos);

    if (html.startsWith('<!--', lt)) {
      // Комментарий заменяется пробелом: `a<!-- c -->b` → `a b`.
      out += html.slice(pos, lt) + ' ';
      const end = findCommentEnd(html, lt);
      if (end === null) return out;
      pos = end;
      continue;
    }

    const name = inertElementAt(html, lt);
    if (name !== null) {
      // Вырезается без пробела: `a<script>…</script>b` → `ab`.
      out += html.slice(pos, lt);
      const closeEnd = findCloseTagEnd(html, name, lt + 1 + name.length);
      if (closeEnd === null) return out;
      pos = closeEnd;
      continue;
    }

    const gt = html.indexOf('>', lt + 1);
    // Незакрытый тег в конце документа остаётся текстом.
    if (gt === -1) return out + html.slice(pos);
    // `<>` — пустое имя тега, это не тег, а текст.
    if (gt === lt + 1) {
      out += html.slice(pos, lt + 1);
      pos = lt + 1;
      continue;
    }
    out += html.slice(pos, lt) + ' ';
    pos = gt + 1;
  }
}

/** Extract visible text from raw HTML (strip comments/script/style/template/tags, collapse whitespace) */
export function extractText(html: string): string {
  return stripMarkup(html).replace(/\s+/g, ' ').trim();
}
