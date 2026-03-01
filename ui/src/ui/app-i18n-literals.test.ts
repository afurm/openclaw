import { beforeEach, describe, expect, it } from "vitest";
import { i18n } from "../i18n/index.ts";
import { applyLiteralTranslations } from "./app-i18n-literals.ts";

function encodeLiteralKey(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

describe("applyLiteralTranslations", () => {
  beforeEach(async () => {
    document.body.innerHTML = "";
    localStorage.removeItem("openclaw.i18n.locale");
    await i18n.setLocale("en");
    // Reset restoration mode between tests.
    applyLiteralTranslations(document.body);
  });

  it("retranslates text nodes using the original source literal", async () => {
    const source = "Gateway Dashboard";
    const encoded = encodeLiteralKey(source);

    i18n.registerTranslation("uk-x-literals-switch", {
      auto: { [encoded]: "Панель шлюзу" },
    });
    i18n.registerTranslation("fr-x-literals-switch", {
      auto: { [encoded]: "Tableau de bord de la passerelle" },
    });

    const root = document.createElement("div");
    root.textContent = ` ${source} `;
    document.body.append(root);

    await i18n.setLocale("uk-x-literals-switch");
    applyLiteralTranslations(root);
    expect(root.textContent?.trim()).toBe("Панель шлюзу");

    await i18n.setLocale("fr-x-literals-switch");
    applyLiteralTranslations(root);
    expect(root.textContent?.trim()).toBe("Tableau de bord de la passerelle");

    await i18n.setLocale("en");
    applyLiteralTranslations(root);
    expect(root.textContent?.trim()).toBe(source);
  });

  it("retranslates tracked attributes and restores on english", async () => {
    const source = "Open settings";
    const encoded = encodeLiteralKey(source);

    i18n.registerTranslation("uk-x-literals-attr", {
      auto: { [encoded]: "Відкрити налаштування" },
    });
    i18n.registerTranslation("fr-x-literals-attr", {
      auto: { [encoded]: "Ouvrir les paramètres" },
    });

    const button = document.createElement("button");
    button.setAttribute("title", source);
    document.body.append(button);

    await i18n.setLocale("uk-x-literals-attr");
    applyLiteralTranslations(document.body);
    expect(button.getAttribute("title")).toBe("Відкрити налаштування");

    await i18n.setLocale("fr-x-literals-attr");
    applyLiteralTranslations(document.body);
    expect(button.getAttribute("title")).toBe("Ouvrir les paramètres");

    await i18n.setLocale("en");
    applyLiteralTranslations(document.body);
    expect(button.getAttribute("title")).toBe(source);
  });
});
