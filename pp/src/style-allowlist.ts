// 全 computed-style (300+) の diff は UA 既定・継承・layout 由来の false diff を生む — 比較はこの allowlist に限る
// camelCase なのは in-page で getComputedStyle(el)[prop] を index するため
export const STYLE_ALLOWLIST: readonly string[] = [
  // typography
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing",
  "textAlign", "textTransform", "textDecorationLine", "whiteSpace", "fontVariantNumeric",
  // color / bg
  "color", "backgroundColor", "backgroundImage", "opacity",
  // border / radius
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "borderTopStyle", "borderRightStyle", "borderBottomStyle", "borderLeftStyle",
  "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
  "borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius",
  // shadow
  "boxShadow", "textShadow",
  // spacing
  "marginTop", "marginRight", "marginBottom", "marginLeft",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "rowGap", "columnGap",
  // layout
  "display", "flexDirection", "flexWrap", "flexGrow", "flexShrink", "flexBasis",
  "justifyContent", "alignItems", "alignContent",
  "gridTemplateColumns", "gridTemplateRows", "gridColumn", "gridRow",
  "position", "width", "height", "boxSizing", "overflowX", "overflowY",
] as const;

// 除外 = noise: -webkit-* UA 既定・cursor・transition/animation（freeze 済み）・transform 行列（DPR 産物）
