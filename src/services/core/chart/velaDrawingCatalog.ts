/**
 * Canonical Vela drawing type catalog exposed by TradingCoreOS.
 * The authoritative implementations remain in vendor/vela; this list is the
 * stable host-facing inventory used by contracts, menus and capability reporting.
 */
export const CORE_SPIRIT_DRAWING_TOOL_CATALOG = Object.freeze([
  'trendline','hline','ray','extendedline','vline','hray','crossline','infoline','trendangle',
  'box','text','note','pricenote','comment','pricelabel','signpost',
  'parallelchannel','disjointchannel','flattopbottom','regressionchannel','anchoredvwap','fixedrangevp',
  'pitchfork','schiffpitchfork','modifiedschiffpitchfork','insidepitchfork',
  'arrow','callout','ellipse','triangle','polyline','freehand','highlighter','circle','rotatedrect','path','arc','curve',
  'arrowmarkup','arrowmarkdown','flagmark','iconstamp',
  'fibretracement','fibextension','fibextensiontrend','fibfan','fibtimezones','fibchannel','fibspeedfan','trendfibtime',
  'fibcircles','fibarcs','fibwedge','fibspiral',
  'gannfan','gannbox','gannsquare',
  'dedekind','sonic','supersonic','goldensonic','goldensupersonic',
  'datepricerange','position','magnifier',
  'fairvaluegap','orderblock','liquidity',
  'xabcd','abcd','elliottimpulse','elliottcorrection','headshoulders',
  'gartley','bat','butterfly','crab','shark','cypher',
] as const);

export type CoreSpiritDrawingTool = typeof CORE_SPIRIT_DRAWING_TOOL_CATALOG[number];
