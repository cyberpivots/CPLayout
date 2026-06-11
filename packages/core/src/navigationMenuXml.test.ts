import assert from "node:assert/strict";

import {
  CPLAYOUT_NAV_MENU_XML_VERSION,
  parseLeftNavMenuXml,
} from "./navigationMenuXml";

const parserOptions = {
  actionIds: ["open_catalog", "navigate_map"],
  disabledWhenIds: ["home_view"],
  iconIds: ["folder", "home", "map"],
  requiredCatalogActionSections: ["create" as const],
  requiredRailSections: ["primary" as const],
};
const validXml = `<cplayoutNavigationMenu version="${CPLAYOUT_NAV_MENU_XML_VERSION}">
  <commandMenus>
    <menu id="file" label="File" icon="folder">
      <item id="catalog" label="Catalog" action="open_catalog" icon="home" disabledWhen="home_view"/>
    </menu>
  </commandMenus>
  <rail section="primary">
    <item id="map" label="Map" action="navigate_map" icon="map"/>
  </rail>
  <catalogActions section="create">
    <item id="client" label="Client" action="open_catalog" icon="home"/>
  </catalogActions>
</cplayoutNavigationMenu>`;

const parsedDefault = parseLeftNavMenuXml(validXml, parserOptions);
assert.equal(parsedDefault.version, CPLAYOUT_NAV_MENU_XML_VERSION);
assert.equal(parsedDefault.commandMenus.length, 1);
assert.equal(parsedDefault.railItems.filter((item) => item.section === "primary").length, 1);
assert.equal(parsedDefault.catalogActions.filter((item) => item.section === "create").length, 1);

assert.throws(
  () => parseLeftNavMenuXml("", parserOptions),
  /empty/,
);

assert.throws(
  () => parseLeftNavMenuXml(`<!DOCTYPE cplayoutNavigationMenu><cplayoutNavigationMenu version="${CPLAYOUT_NAV_MENU_XML_VERSION}"/>`, parserOptions),
  /DOCTYPE/,
);

assert.throws(
  () => parseLeftNavMenuXml(`<!ENTITY hidden "bad"><cplayoutNavigationMenu version="${CPLAYOUT_NAV_MENU_XML_VERSION}"/>`, parserOptions),
  /ENTITY/,
);

assert.throws(
  () => parseLeftNavMenuXml(`<cplayoutNavigationMenu version="${CPLAYOUT_NAV_MENU_XML_VERSION}"><commandMenus><menu id="file" label="File" icon="folder"><item id="bad" label="Bad" action="run_hidden_api" icon="home"/></menu></commandMenus></cplayoutNavigationMenu>`, parserOptions),
  /action/,
);

assert.throws(
  () => parseLeftNavMenuXml(`<cplayoutNavigationMenu version="${CPLAYOUT_NAV_MENU_XML_VERSION}"><commandMenus><menu id="file" label="File" icon="missing"><item id="bad" label="Bad" action="navigate_map" icon="home"/></menu></commandMenus></cplayoutNavigationMenu>`, parserOptions),
  /icon/,
);

assert.throws(
  () => parseLeftNavMenuXml(`<cplayoutNavigationMenu version="${CPLAYOUT_NAV_MENU_XML_VERSION}"><commandMenus><menu id="file" label="File" icon="folder"><item id="dup" label="One" action="navigate_map" icon="home"/><item id="dup" label="Two" action="navigate_map" icon="home"/></menu></commandMenus></cplayoutNavigationMenu>`, parserOptions),
  /Duplicate/,
);

assert.throws(
  () => parseLeftNavMenuXml(`<cplayoutNavigationMenu version="older"><commandMenus/></cplayoutNavigationMenu>`, parserOptions),
  /Unsupported/,
);

assert.throws(
  () => parseLeftNavMenuXml(`<cplayoutNavigationMenu version="${CPLAYOUT_NAV_MENU_XML_VERSION}"><commandMenus/></cplayoutNavigationMenu>`, parserOptions),
  /missing rail section primary/,
);
