import { DOMParser } from "@xmldom/xmldom";

export const CPLAYOUT_NAV_MENU_XML_VERSION = "cplayout-nav-menu-v1";

export type LeftNavMenuActionId = string;
export type LeftNavMenuDisplay = "all" | "compact";
export type LeftNavMenuDisabledWhen = string;
export type LeftNavMenuSection = "primary" | "secondary";
export type LeftNavCatalogActionSection = "create" | "utility";
export type LeftNavMenuSlotSource = "sample_designs";

export interface LeftNavMenuItemDefinition {
  action: LeftNavMenuActionId;
  description?: string;
  disabledWhen?: LeftNavMenuDisabledWhen;
  icon: string;
  id: string;
  label: string;
  testID?: string;
}

export interface LeftNavMenuSlotDefinition {
  id: string;
  source: LeftNavMenuSlotSource;
}

export type LeftNavCommandMenuEntry = LeftNavMenuItemDefinition | LeftNavMenuSlotDefinition;

export interface LeftNavCommandMenuDefinition {
  display: LeftNavMenuDisplay;
  icon: string;
  id: string;
  items: LeftNavCommandMenuEntry[];
  label: string;
  testID?: string;
}

export interface LeftNavRailItemDefinition extends LeftNavMenuItemDefinition {
  section: LeftNavMenuSection;
}

export interface LeftNavCatalogActionDefinition extends LeftNavMenuItemDefinition {
  section: LeftNavCatalogActionSection;
}

export interface LeftNavMenuDefinition {
  catalogActions: LeftNavCatalogActionDefinition[];
  commandMenus: LeftNavCommandMenuDefinition[];
  railItems: LeftNavRailItemDefinition[];
  version: typeof CPLAYOUT_NAV_MENU_XML_VERSION;
}

export interface LeftNavMenuXmlParserOptions {
  actionIds: readonly string[];
  disabledWhenIds?: readonly string[];
  iconIds: readonly string[];
  requiredCatalogActionSections?: readonly LeftNavCatalogActionSection[];
  requiredRailSections?: readonly LeftNavMenuSection[];
  slotSources?: readonly LeftNavMenuSlotSource[];
  version?: typeof CPLAYOUT_NAV_MENU_XML_VERSION;
}

type XmlDocument = ReturnType<InstanceType<typeof DOMParser>["parseFromString"]>;
type XmlElement = NonNullable<XmlDocument["documentElement"]>;
type ParserContext = {
  actionIds: Set<string>;
  disabledWhenIds: Set<string>;
  iconIds: Set<string>;
  requiredCatalogActionSections: readonly LeftNavCatalogActionSection[];
  requiredRailSections: readonly LeftNavMenuSection[];
  slotSources: Set<string>;
  version: typeof CPLAYOUT_NAV_MENU_XML_VERSION;
};

const DISPLAYS = new Set<string>(["all", "compact"]);
const RAIL_SECTIONS = new Set<string>(["primary", "secondary"]);
const CATALOG_ACTION_SECTIONS = new Set<string>(["create", "utility"]);

export function parseLeftNavMenuXml(xmlText: string, options: LeftNavMenuXmlParserOptions): LeftNavMenuDefinition {
  const context = parserContext(options);
  if (!xmlText.trim()) throw new Error("CPLayout navigation menu XML is empty.");
  if (/<!DOCTYPE/i.test(xmlText)) throw new Error("CPLayout navigation menu XML does not allow DOCTYPE declarations.");
  if (/<!ENTITY/i.test(xmlText)) throw new Error("CPLayout navigation menu XML does not allow ENTITY declarations.");
  const document = new DOMParser().parseFromString(xmlText, "text/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error("CPLayout navigation menu XML could not be parsed: invalid XML.");
  }
  const root = document.documentElement as XmlElement | null;
  if (!root || localName(root) !== "cplayoutNavigationMenu") {
    throw new Error("CPLayout navigation menu XML root element must be cplayoutNavigationMenu.");
  }
  const version = requiredAttr(root, "version");
  if (version !== context.version) {
    throw new Error(`Unsupported CPLayout navigation menu XML version ${version}.`);
  }

  const seenIds = new Set<string>();
  validateRootChildren(root);
  const commandMenus = children(requiredChild(root, "commandMenus"), "menu").map((menu) => parseCommandMenu(menu, seenIds, context));
  const railItems = children(root, "rail").flatMap((rail) => parseRail(rail, seenIds, context));
  const catalogActions = children(root, "catalogActions").flatMap((actions) => parseCatalogActions(actions, seenIds, context));
  validateRequiredSections(railItems, catalogActions, context);

  return {
    catalogActions,
    commandMenus,
    railItems,
    version: CPLAYOUT_NAV_MENU_XML_VERSION,
  };
}

function parseCommandMenu(element: XmlElement, seenIds: Set<string>, context: ParserContext): LeftNavCommandMenuDefinition {
  const id = scopedId("commandMenu", requiredAttr(element, "id"), seenIds);
  const display = optionalEnumAttr<LeftNavMenuDisplay>(element, "display", DISPLAYS) ?? "all";
  return {
    display,
    icon: iconAttr(element, context),
    id,
    items: children(element).map((child) => {
      if (localName(child) === "slot") return parseSlot(child, id, seenIds, context);
      if (localName(child) === "item") return parseMenuItem(child, `commandItem:${id}`, seenIds, context);
      throw new Error(`Unsupported CPLayout navigation menu element ${localName(child)} inside menu ${id}.`);
    }),
    label: requiredAttr(element, "label"),
    testID: optionalAttr(element, "testID"),
  };
}

function parseSlot(element: XmlElement, scope: string, seenIds: Set<string>, context: ParserContext): LeftNavMenuSlotDefinition {
  return {
    id: scopedId(`slot:${scope}`, requiredAttr(element, "id"), seenIds),
    source: enumAttr<LeftNavMenuSlotSource>(element, "source", context.slotSources),
  };
}

function parseRail(element: XmlElement, seenIds: Set<string>, context: ParserContext): LeftNavRailItemDefinition[] {
  const section = enumAttr<LeftNavMenuSection>(element, "section", RAIL_SECTIONS);
  return children(element, "item").map((item) => ({
    ...parseMenuItem(item, `rail:${section}`, seenIds, context),
    section,
  }));
}

function parseCatalogActions(element: XmlElement, seenIds: Set<string>, context: ParserContext): LeftNavCatalogActionDefinition[] {
  const section = enumAttr<LeftNavCatalogActionSection>(element, "section", CATALOG_ACTION_SECTIONS);
  return children(element, "item").map((item) => ({
    ...parseMenuItem(item, `catalog:${section}`, seenIds, context),
    section,
  }));
}

function parseMenuItem(element: XmlElement, scope: string, seenIds: Set<string>, context: ParserContext): LeftNavMenuItemDefinition {
  return {
    action: enumAttr<LeftNavMenuActionId>(element, "action", context.actionIds),
    description: optionalAttr(element, "description"),
    disabledWhen: optionalEnumAttr<LeftNavMenuDisabledWhen>(element, "disabledWhen", context.disabledWhenIds),
    icon: iconAttr(element, context),
    id: scopedId(scope, requiredAttr(element, "id"), seenIds),
    label: requiredAttr(element, "label"),
    testID: optionalAttr(element, "testID"),
  };
}

function parserContext(options: LeftNavMenuXmlParserOptions): ParserContext {
  if (options.actionIds.length === 0) throw new Error("CPLayout navigation menu parser requires at least one action id.");
  if (options.iconIds.length === 0) throw new Error("CPLayout navigation menu parser requires at least one icon id.");
  return {
    actionIds: new Set(options.actionIds),
    disabledWhenIds: new Set(options.disabledWhenIds ?? []),
    iconIds: new Set(options.iconIds),
    requiredCatalogActionSections: options.requiredCatalogActionSections ?? [],
    requiredRailSections: options.requiredRailSections ?? [],
    slotSources: new Set(options.slotSources ?? ["sample_designs"]),
    version: options.version ?? CPLAYOUT_NAV_MENU_XML_VERSION,
  };
}

function iconAttr(element: XmlElement, context: ParserContext): string {
  const icon = requiredAttr(element, "icon");
  if (!context.iconIds.has(icon)) throw new Error(`Unsupported CPLayout navigation menu icon value ${icon}.`);
  return icon;
}

function validateRootChildren(root: XmlElement): void {
  const allowed = new Set(["commandMenus", "rail", "catalogActions"]);
  for (const child of children(root)) {
    if (!allowed.has(localName(child))) throw new Error(`Unsupported CPLayout navigation menu root element ${localName(child)}.`);
  }
}

function validateRequiredSections(
  railItems: LeftNavRailItemDefinition[],
  catalogActions: LeftNavCatalogActionDefinition[],
  context: ParserContext,
): void {
  for (const section of context.requiredRailSections) {
    if (!railItems.some((item) => item.section === section)) {
      throw new Error(`CPLayout navigation menu XML is missing rail section ${section}.`);
    }
  }
  for (const section of context.requiredCatalogActionSections) {
    if (!catalogActions.some((item) => item.section === section)) {
      throw new Error(`CPLayout navigation menu XML is missing catalogActions section ${section}.`);
    }
  }
}

function scopedId(scope: string, id: string, seenIds: Set<string>): string {
  const scoped = `${scope}:${id}`;
  if (seenIds.has(scoped)) throw new Error(`Duplicate CPLayout navigation menu id ${id} in ${scope}.`);
  seenIds.add(scoped);
  return id;
}

function children(parent: XmlElement | null, childName?: string): XmlElement[] {
  if (!parent) return [];
  return (Array.from(parent.childNodes).filter((node) => node.nodeType === 1) as XmlElement[])
    .filter((element) => !childName || localName(element) === childName);
}

function requiredChild(parent: XmlElement, childName: string): XmlElement {
  const child = children(parent, childName)[0];
  if (!child) throw new Error(`CPLayout navigation menu XML is missing ${childName}.`);
  return child;
}

function requiredAttr(element: XmlElement, attr: string): string {
  const value = element.getAttribute(attr);
  if (value === null || value.trim() === "") throw new Error(`CPLayout navigation menu XML is missing ${attr} on ${localName(element)}.`);
  return value.trim();
}

function optionalAttr(element: XmlElement, attr: string): string | undefined {
  const value = element.getAttribute(attr);
  return value === null || value.trim() === "" ? undefined : value.trim();
}

function enumAttr<T extends string>(element: XmlElement, attr: string, allowed: Set<string>): T {
  const value = requiredAttr(element, attr);
  if (!allowed.has(value)) throw new Error(`Unsupported CPLayout navigation menu ${attr} value ${value}.`);
  return value as T;
}

function optionalEnumAttr<T extends string>(element: XmlElement, attr: string, allowed: Set<string>, fallback?: T): T | undefined {
  const value = optionalAttr(element, attr);
  if (!value) return fallback;
  if (!allowed.has(value)) throw new Error(`Unsupported CPLayout navigation menu ${attr} value ${value}.`);
  return value as T;
}

function localName(element: XmlElement): string {
  return element.localName || element.nodeName.split(":").pop() || element.nodeName;
}
