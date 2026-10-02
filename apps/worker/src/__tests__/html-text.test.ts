import { describe, it, expect } from 'vitest';
import { extractText } from '../steps/html-text.js';

describe('extractText — корректный HTML', () => {
  it('снимает теги, script и style, сжимает пробелы', () => {
    const html =
      '<!DOCTYPE html><html lang="ru"><head><title>T</title>' +
      '<style>body{margin:0}</style><script src="/app.js"></script></head>' +
      '<body><h1>Заголовок</h1>\n  <p>Текст\tстраницы</p></body></html>';
    expect(extractText(html)).toBe('T Заголовок Текст страницы');
  });

  it('вырезанный script не склеивает соседний текст через пробел', () => {
    expect(extractText('a<script>var x=1;</script>b')).toBe('ab');
  });

  it('регистр тегов не важен', () => {
    expect(extractText('<SCRIPT>x</SCRIPT>text<STYLE>y</STYLE>')).toBe('text');
  });

  it('noscript считается видимым текстом: это то, что видит агент без JS', () => {
    expect(extractText('<body><noscript>No JS content</noscript></body>')).toBe('No JS content');
  });
});

describe('extractText — не-ASCII заглавные буквы', () => {
  // `U+0130` (İ) — единственный код-пойнт, у которого toLowerCase() удлиняет строку
  // (i + U+0307). Параллельная строка в нижнем регистре сдвигала бы все последующие
  // индексы, и срезы «уезжали»: разметка текла в текст, настоящий текст терялся.
  it('İ (U+0130) не сдвигает индексы: разметка не течёт в текст', () => {
    expect(extractText('<p>İSTANBUL</p><script>var x=1;</script><p>after text</p>')).toBe(
      'İSTANBUL after text',
    );
  });

  it('несколько İ подряд не теряют текст после вырезанного script', () => {
    expect(extractText('<p>İİİİİ</p><script>junk</script><p>after</p>')).toBe('İİİİİ after');
  });

  it('İ внутри инертного элемента и комментария не нарушает границы', () => {
    expect(extractText('<p>A</p><script>var t="İİİ";</script><!-- İ -->B')).toBe('A B');
  });

  it('İ не ломает распознавание регистра имени тега', () => {
    expect(extractText('İ<SCRIPT>İİ</SCRIPT>İ<STYLE>İ</STYLE>text')).toBe('İİtext');
  });
});

describe('extractText — незакрытые инертные элементы', () => {
  it('незакрытый script съедает остаток документа, как HTML-парсер', () => {
    const js = `var payload = "${'z'.repeat(5000)}";`;
    expect(extractText(`<p>Hi</p><script>${js}`)).toBe('Hi');
  });

  it('незакрытый style съедает остаток документа', () => {
    expect(extractText(`<p>Hi</p><style>.a{content:"${'z'.repeat(5000)}"}`)).toBe('Hi');
  });

  it('закрывающий тег с пробелом перед «>» распознаётся (валидный HTML5)', () => {
    expect(extractText('<p>A</p><script>var x=1;</script >ok<p>B</p>')).toBe('A ok B');
    expect(extractText('<style>a{b:c}</style >ok')).toBe('ok');
  });
});

describe('extractText — комментарии и template', () => {
  it('комментарий с «>» внутри вырезается целиком, а не до первого «>»', () => {
    const html = `<html><body><!-- legacy markup a > b removed ${'z'.repeat(8400)} --></body></html>`;
    expect(extractText(html)).toBe('');
  });

  it('текст вокруг комментария не склеивается', () => {
    expect(extractText('a<!-- c -->b')).toBe('a b');
  });

  it('незакрытый комментарий съедает остаток документа', () => {
    expect(extractText(`<p>Hi</p><!-- oops ${'z'.repeat(1000)}`)).toBe('Hi');
  });

  it('содержимое template инертно и не считается видимым текстом', () => {
    const html = `<body><div id="root"></div><template><p>${'t'.repeat(3500)}</p></template>vis</body>`;
    expect(extractText(html)).toBe('vis');
  });

  it('«<!-->» — завершённый комментарий (HTML5 abrupt closing), хвост остаётся текстом', () => {
    expect(extractText('a<!-->bbbb visible tail')).toBe('a bbbb visible tail');
  });

  it('«<!--->» — тоже завершённый комментарий', () => {
    expect(extractText('a<!--->bbbb visible tail')).toBe('a bbbb visible tail');
  });

  it('«<!---->» (пустой комментарий обычной формы) не съедает хвост', () => {
    expect(extractText('a<!---->tail')).toBe('a tail');
  });
});

describe('extractText — самозакрывающиеся инертные теги', () => {
  // Консервативно: `<script/>` снимается как обычный тег и НЕ съедает остаток
  // документа. Обнуление видимого текста дало бы ложный jsOnlyContent: true.
  it('<script/> не съедает остаток документа', () => {
    expect(extractText('<svg><script/></svg>vis')).toBe('vis');
  });

  it('<style/> и <template/> не съедают остаток документа', () => {
    expect(extractText('<style/>vis')).toBe('vis');
    expect(extractText('<template/>vis')).toBe('vis');
  });

  it('обычная парная форма по-прежнему вырезается вместе с содержимым', () => {
    expect(extractText('<script>var x=1;</script>vis')).toBe('vis');
  });
});

describe('extractText — производительность на недоверенном HTML', () => {
  // Прежние ленивые регулярки давали O(n²): ревьюер замерял ~9 с на 1 МБ с 20k
  // незакрытых `<script`. Порог щедрый, чтобы тест не флакал на медленном CI.
  const BUDGET_MS = 1000;

  it('1 МБ с десятками тысяч незакрытых <script обрабатывается быстро', () => {
    const html = '<script type="text/javascript">var x=1;'.repeat(26_000);
    expect(html.length).toBeGreaterThan(1_000_000);
    const started = Date.now();
    const text = extractText(html);
    expect(Date.now() - started).toBeLessThan(BUDGET_MS);
    expect(text).toBe('');
  });

  it('2 МБ с десятками тысяч незакрытых <style обрабатывается быстро', () => {
    const html = '<style type="text/css">.a{color:red}'.repeat(56_000);
    expect(html.length).toBeGreaterThan(2_000_000);
    const started = Date.now();
    const text = extractText(html);
    expect(Date.now() - started).toBeLessThan(BUDGET_MS);
    expect(text).toBe('');
  });

  it('1 МБ с «<» без единого «>» обрабатывается быстро', () => {
    const html = `<${'a'.repeat(50)}`.repeat(20_000);
    const started = Date.now();
    extractText(html);
    expect(Date.now() - started).toBeLessThan(BUDGET_MS);
  });

  it('2 МБ обычной разметки с закрытыми скриптами обрабатывается быстро', () => {
    const html = '<div class="row"><p>Hello world</p><script>var x=1;</script></div>'.repeat(32_000);
    expect(html.length).toBeGreaterThan(2_000_000);
    const started = Date.now();
    const text = extractText(html);
    expect(Date.now() - started).toBeLessThan(BUDGET_MS);
    expect(text.startsWith('Hello world Hello world')).toBe(true);
  });

  it('2 МБ текста с İ (U+0130) обрабатывается быстро', () => {
    const html = '<p>İstanbul İzmir</p>'.repeat(100_000);
    expect(html.length).toBeGreaterThan(2_000_000);
    const started = Date.now();
    const text = extractText(html);
    expect(Date.now() - started).toBeLessThan(BUDGET_MS);
    expect(text.startsWith('İstanbul İzmir İstanbul')).toBe(true);
  });
});
