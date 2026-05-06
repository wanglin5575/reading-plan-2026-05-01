import { permanentRedirect } from "next/navigation";

/** 旧预览路径，避免与「真实演示登录」混淆；请使用 /weekly-ui-preview */
export default function LegacyLoggedInPreviewRedirect() {
  permanentRedirect("/weekly-ui-preview");
}
