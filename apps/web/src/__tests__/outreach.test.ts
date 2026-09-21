import { describe, expect, it } from "vitest";
import {
  hubspotContactProperties,
  hubspotNoteBody,
  pipedrivePersonBody,
  splitName,
} from "@/server/crm-drivers";
import { DEFAULT_TEMPLATES, fillTemplate } from "@/server/outreach-text";

describe("templates", () => {
  it("fills placeholders and drops unknown ones", () => {
    const t = fillTemplate(DEFAULT_TEMPLATES.paymentRequest, {
      name: "Ahmad",
      amount: "$150.00",
      payLink: "https://pay",
      host: "Demo",
    });
    expect(t.subject).toBe("Invoice: $150.00");
    expect(t.body).toContain("Hi Ahmad,");
    expect(t.body).toContain("https://pay");
    expect(fillTemplate({ subject: "{missing}!", body: "" }, {}).subject).toBe("!");
  });
});

describe("crm request bodies", () => {
  it("maps a contact to HubSpot and Pipedrive shapes", () => {
    expect(splitName("Ahmad Hakroosh")).toEqual({ first: "Ahmad", last: "Hakroosh" });
    const c = {
      email: "a@x.io",
      name: "Ahmad Hakroosh",
      company: "Acme",
      phone: "+1",
      stage: "won" as const,
    };
    expect(hubspotContactProperties(c)).toMatchObject({
      email: "a@x.io",
      firstname: "Ahmad",
      lastname: "Hakroosh",
      company: "Acme",
      lifecyclestage: "customer",
    });
    expect(hubspotNoteBody("123", "hello").associations[0]!.to.id).toBe("123");
    expect(pipedrivePersonBody(c).email[0]!.value).toBe("a@x.io");
    expect(pipedrivePersonBody({ ...c, phone: null }).phone).toBeUndefined();
  });
});
