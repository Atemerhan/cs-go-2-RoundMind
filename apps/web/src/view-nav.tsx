import { copy, type Lang } from "./i18n";

const viewText = {
  zh: { views: "视图", calculator: "计算器", review: "赛后复盘" },
  en: { views: "Views", calculator: "Calculator", review: "Review" },
} as const;

export function ViewNav(props: { lang: Lang; current: "calculator" | "review" }) {
  const text = viewText[props.lang];
  return (
    <nav className="views" aria-label={text.views}>
      <a href="#calculator" aria-current={props.current === "calculator" ? "page" : undefined}>{text.calculator}</a>
      <a href="#review" aria-current={props.current === "review" ? "page" : undefined}>{text.review}</a>
    </nav>
  );
}

export function LanguageSwitch(props: { lang: Lang; onChange: (lang: Lang) => void }) {
  return (
    <div className="lang" role="group" aria-label={copy(props.lang).language}>
      <button type="button" aria-pressed={props.lang === "zh"} onClick={() => props.onChange("zh")}>中文</button>
      <button type="button" aria-pressed={props.lang === "en"} onClick={() => props.onChange("en")}>EN</button>
    </div>
  );
}
