// 凍結前の mock 自身の破れを機械で出す。app ではなく mock を見るので、実装より前に落とせる
// MOCK201 = 横スクロール / MOCK202 = はみ出した要素 / MOCK203 = 操作要素が覆われている
// MOCK204 = 画面間で同じものが違う言い方をされている / MOCK205 = dialog が viewport に収まらない
// MOCK206 = 画面の角丸が design system に無い
// 凍結を止めるのは 201/202/203/205。実装が mock を写す厳密さを、mock の画面どうしへ当てない
import type { Page } from "@playwright/test";

export interface Finding {
  id: string;
  screen: string;
  detail: string;
}

// 画面ごとの言い方の違いは意匠の判断。揃えると見た目や読みやすさが壊れることがあるので、機械は知らせるだけ
const ADVISORY_IDS: ReadonlySet<string> = new Set(["MOCK204", "MOCK206"]);

export const isAdvisory = (finding: Finding): boolean => ADVISORY_IDS.has(finding.id);

/** 凍結を止めてよいのは、機械が壊れと断定できるものだけ */
export const blockingFindings = (findings: readonly Finding[]): Finding[] =>
  findings.filter((finding) => !isAdvisory(finding));

// 要素の言い表し方は Node 側に 1 つだけ置く（page.evaluate では素の値だけ受け渡す）
export interface ElementRef {
  tag: string;
  id: string;
  text: string;
}

export const describe = (ref: ElementRef): string =>
  `${ref.tag}${ref.id ? `#${ref.id}` : ""}${ref.text ? `「${ref.text}」` : ""}`;

export interface OverflowBox {
  ref: ElementRef;
  right: number;
}

export interface CoveredControl {
  ref: ElementRef;
  by: ElementRef;
}

export interface DialogFit {
  ref: ElementRef;
  overflow: string;
}

export interface WidthMeasurement {
  docWidth: number;
  overflowing: OverflowBox[];
}

// 画面間で突き合わせる語彙。href と custom property は画面をまたいで同じ意味を持つ
export interface ScreenVocabulary {
  linkTexts: Record<string, string>;
  tokens: Record<string, string>;
}

const CONTROL_SELECTOR = "a[href],button,input,select,textarea,[role=button],[role=link]";
const NAVIGATION_LINK_SELECTOR = "nav a[href],header a[href],footer a[href],[role=navigation] a[href]";

// page.evaluate の中で名前付き関数を作らない。tsx の keepNames が browser に無い __name を挿し込む
export async function measureWidth(page: Page): Promise<WidthMeasurement> {
  return page.evaluate(() => {
    // mobile emulation では、はみ出した要素の分だけ innerWidth（layout viewport）が広がる。
    // 見えている幅は clientWidth なので、はみ出しの基準はこちらを使う
    const viewportWidth = document.documentElement.clientWidth;
    const out = Array.from(document.querySelectorAll("body *"))
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0 && rect.right > viewportWidth + 1);
    // はみ出しが始まる境目だけ挙げる。中身は器の幅を引き継ぐので、子まで並べると原因が埋もれる
    const overflowing = out
      .filter(({ el }) => !out.some((other) => other.el !== el && other.el.contains(el)))
      .map(({ el, rect }) => ({
        ref: {
          tag: el.tagName.toLowerCase(),
          id: el.getAttribute("data-visual-id") ?? el.id,
          text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 24),
        },
        right: Math.round(rect.right),
      }));
    return { docWidth: document.documentElement.scrollWidth, overflowing };
  });
}

// 面で覆われた操作要素は click が届かない。viewport 内でしか判定できないので、1 画面ぶん送りながら見る
export async function findCoveredControls(page: Page): Promise<CoveredControl[]> {
  const step = page.viewportSize()?.height ?? 800;
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const found = new Map<string, CoveredControl>();
  for (let top = 0; top < pageHeight; top += step) {
    await page.evaluate((y) => scrollTo(0, y), top);
    const covered = await page.evaluate((controlSelector) => {
      const { clientWidth, clientHeight } = document.documentElement;
      const out: { ref: ElementRef; by: ElementRef }[] = [];
      for (const el of Array.from(document.querySelectorAll(controlSelector))) {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.pointerEvents === "none") continue;
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        if (x < 0 || y < 0 || x > clientWidth || y > clientHeight) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit === null || el.contains(hit) || hit.contains(el)) continue;
        out.push({
          ref: { tag: el.tagName.toLowerCase(), id: el.getAttribute("data-visual-id") ?? el.id, text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 24) },
          by: { tag: hit.tagName.toLowerCase(), id: hit.getAttribute("data-visual-id") ?? hit.id, text: (hit.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 24) },
        });
      }
      return out;
    }, CONTROL_SELECTOR);
    for (const control of covered) found.set(describe(control.ref), control);
  }
  await page.evaluate(() => scrollTo(0, 0));
  return [...found.values()];
}

// click で初めて mount する dialog は測れない。DOM にある分だけ 1 つずつ現し、元へ戻す
export async function findUnfitDialogs(page: Page): Promise<DialogFit[]> {
  return page.evaluate(() => {
    const { clientWidth, clientHeight } = document.documentElement;
    const unfit: { ref: ElementRef; overflow: string }[] = [];
    for (const dialog of Array.from(document.querySelectorAll<HTMLElement>("[role=dialog],dialog"))) {
      const inline = dialog.getAttribute("style");
      const wasOpen = dialog.hasAttribute("open");
      for (const [property, value] of [["display", "block"], ["visibility", "visible"], ["opacity", "1"]]) {
        dialog.style.setProperty(property!, value!, "important");
      }
      if (dialog.tagName === "DIALOG") dialog.setAttribute("open", "");
      const rect = dialog.getBoundingClientRect();
      const over = [
        rect.left < -1 ? `left ${Math.round(-rect.left)}px 超過` : "",
        rect.top < -1 ? `top ${Math.round(-rect.top)}px 超過` : "",
        rect.right > clientWidth + 1 ? `right ${Math.round(rect.right - clientWidth)}px 超過` : "",
        rect.bottom > clientHeight + 1 ? `bottom ${Math.round(rect.bottom - clientHeight)}px 超過` : "",
      ].filter(Boolean);
      if (over.length > 0) {
        unfit.push({
          ref: {
            tag: dialog.tagName.toLowerCase(),
            id: dialog.getAttribute("data-visual-id") ?? dialog.id,
            text: (dialog.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 24),
          },
          overflow: over.join(" / "),
        });
      }
      if (inline === null) dialog.removeAttribute("style");
      else dialog.setAttribute("style", inline);
      if (!wasOpen) dialog.removeAttribute("open");
    }
    return unfit;
  });
}

export async function readVocabulary(page: Page): Promise<ScreenVocabulary> {
  return page.evaluate((NAVIGATION_LINK_SELECTOR) => {
    const linkTexts: Record<string, string> = {};
    // 突き合わせるのは画面をまたいで同じものを指す導線だけ。本文中のリンクは文脈で言い方が変わってよい
    for (const link of Array.from(document.querySelectorAll(NAVIGATION_LINK_SELECTOR))) {
      const text = (link.textContent ?? "").trim();
      // 画像だけのリンクや空リンクは文言を持たないので突き合わせの対象にしない
      if (text) linkTexts[link.getAttribute("href") ?? ""] = text;
    }
    const tokens: Record<string, string> = {};
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSStyleRule)) continue;
        if (!/(^|,)\s*(:root|html)\s*(,|$)/.test(rule.selectorText)) continue;
        for (const name of Array.from(rule.style)) {
          if (name.startsWith("--")) tokens[name] = rule.style.getPropertyValue(name).trim();
        }
      }
    }
    return { linkTexts, tokens };
  }, NAVIGATION_LINK_SELECTOR);
}

export async function readRadii(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const radii: Record<string, number> = {};
    const properties = [
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomRightRadius",
      "borderBottomLeftRadius",
    ] as const;
    for (const element of Array.from(document.querySelectorAll("*"))) {
      // 祖先が display:none でも自分の computed display は none にならないので、描画矩形の有無で見る
      if (element.getClientRects().length === 0) continue;
      const style = getComputedStyle(element);
      const values = new Set<string>();
      for (const property of properties) {
        const value = style[property];
        if (value.endsWith("%") && Number.parseFloat(value) !== 0) values.add(value);
        else if (value.endsWith("px") && Number.parseFloat(value) !== 0) {
          values.add(String(Math.round(Number.parseFloat(value))));
        }
      }
      for (const value of values) radii[value] = (radii[value] ?? 0) + 1;
    }
    return radii;
  });
}

// 同じ幅で何十件も並べても直す順は変わらない。右へ出ている順に上位だけ挙げ、残りは件数で示す
const NAMED_OVERFLOW_LIMIT = 5;

export function widthFindings(screen: string, width: number, measurement: WidthMeasurement): Finding[] {
  // 横スクロールが無いのに個々の要素だけ挙げると、意図した装飾のはみ出しまで赤にする
  if (measurement.docWidth <= width) return [];
  const worst = [...measurement.overflowing].sort((a, b) => b.right - a.right);
  const rest = worst.length - NAMED_OVERFLOW_LIMIT;
  return [
    { id: "MOCK201", screen, detail: `@${width}px: 横スクロールする（document ${measurement.docWidth}px）` },
    ...worst.slice(0, NAMED_OVERFLOW_LIMIT).map((box) => ({
      id: "MOCK202",
      screen,
      detail: `@${width}px: ${describe(box.ref)} が右端 ${box.right}px まで出ている`,
    })),
    ...(rest > 0 ? [{ id: "MOCK202", screen, detail: `@${width}px: 同様にはみ出す要素があと ${rest} 件` }] : []),
  ];
}

export function coveredFindings(screen: string, viewport: string, covered: readonly CoveredControl[]): Finding[] {
  return covered.map((control) => ({
    id: "MOCK203",
    screen,
    detail: `@${viewport}: ${describe(control.ref)} が ${describe(control.by)} に覆われている`,
  }));
}

export function dialogFindings(screen: string, viewport: string, unfit: readonly DialogFit[]): Finding[] {
  return unfit.map((dialog) => ({
    id: "MOCK205",
    screen,
    detail: `@${viewport}: ${describe(dialog.ref)} が viewport に収まらない（${dialog.overflow}）`,
  }));
}

// 同じものが画面ごとに違う言い方をされていることを知らせる。揃えるかは読んだ人が決める
export function vocabularyFindings(
  vocabularies: Record<string, ScreenVocabulary>,
  referencePages: readonly string[] = [],
): Finding[] {
  const findings: Finding[] = [];
  const collect = (
    pick: (vocabulary: ScreenVocabulary) => Record<string, string>,
    what: string,
    skip: readonly string[],
  ): void => {
    const byKey = new Map<string, Map<string, string[]>>();
    for (const [screen, vocabulary] of Object.entries(vocabularies)) {
      if (skip.includes(screen)) continue;
      for (const [key, value] of Object.entries(pick(vocabulary))) {
        const byValue = byKey.get(key) ?? new Map<string, string[]>();
        byValue.set(value, [...(byValue.get(value) ?? []), screen]);
        byKey.set(key, byValue);
      }
    }
    for (const [key, byValue] of [...byKey.entries()].sort()) {
      if (byValue.size < 2) continue;
      const split = [...byValue.entries()]
        .map(([value, screens]) => `${screens.sort().join("・")} = ${JSON.stringify(value)}`)
        .join(" / ");
      findings.push({ id: "MOCK204", screen: "（画面間）", detail: `${what} ${key} が画面ごとに違う: ${split}` });
    }
  };
  // 見本帳は site の導線を持たないので、導線の文言としては比べない
  collect((vocabulary) => vocabulary.linkTexts, "リンク文言", referencePages);
  // token 名の母体は見本帳。値が画面と割れたら見本側の生成ぶれなので、こちらは比べる
  collect((vocabulary) => vocabulary.tokens, "token", []);
  return findings;
}

const radiusOrder = (a: string, b: string): number =>
  Number.parseFloat(a) - Number.parseFloat(b) || a.localeCompare(b);

export function resolveRadiusScale(
  declaration: string | null,
  referenceRadii: Record<string, Record<string, number>>,
): ReadonlySet<string> {
  if (declaration === null) {
    return new Set(Object.values(referenceRadii).flatMap((radii) => Object.keys(radii)).sort(radiusOrder));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(declaration);
  } catch {
    throw new Error("pp: design-scale.json は version と radius を持つ JSON で書く");
  }
  const scale = parsed as { version?: unknown; radius?: unknown };
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    scale.version !== "1" ||
    !Array.isArray(scale.radius) ||
    scale.radius.some(
      (value) =>
        !(
          (typeof value === "number" && Number.isFinite(value)) ||
          (typeof value === "string" && /^\d+(?:\.\d+)?%$/.test(value))
        ),
    )
  ) {
    throw new Error("pp: design-scale.json は version \"1\" と number または % の radius 配列で書く");
  }
  return new Set(scale.radius.map(String));
}

export function radiusFindings(
  radii: Record<string, Record<string, number>>,
  scale: ReadonlySet<string>,
  referencePages: readonly string[],
): Finding[] {
  return Object.entries(radii).flatMap(([screen, values]) =>
    referencePages.includes(screen)
      ? []
      : Object.entries(values)
          .filter(([value]) => !scale.has(value))
          .sort(([a], [b]) => radiusOrder(a, b))
          .map(([value, count]) => ({
            id: "MOCK206",
            screen,
            detail: `角丸 ${value.endsWith("%") ? value : `${value}px`} が design system に無い（${count} 箇所）`,
          })),
  );
}
