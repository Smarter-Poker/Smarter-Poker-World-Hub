/**
 * Compatibility-only metadata for the live Video Library.
 *
 * This module intentionally contains no playable catalog records. The catalog
 * API is the sole authority for titles, playback and availability. Legacy IDs
 * remain only so old bookmarks and persisted personal-library records migrate
 * to their canonical YouTube IDs before the live API verifies them.
 */
export const LEGACY_VIDEO_ID_ALIASES = Object.freeze({
  "hcl1": "D5R_ZQZDR1Q",
  "hcl2": "bjSK8Ajhm2g",
  "hcl3": "fif_M-C7uxM",
  "hcl4": "4ErqhJMdTqE",
  "hcl5": "2aaQ8D5mQiQ",
  "hcl6": "Tvt3ib08foo",
  "hcl7": "TKuwraMHM4s",
  "hcl8": "wMpb2U4bogY",
  "hcl9": "hJkpOdcC9b4",
  "hcl10": "q-LPKh4BcDU",
  "hcl11": "7fe18ZyRR3o",
  "hcl12": "9BHqoXOGwqo",
  "hcl13": "ZXBCQHCcQDQ",
  "hcl14": "Z54GrBrtjEY",
  "hcl15": "BBiMGvjyjfc",
  "hcl16": "XWNNilCpZDs",
  "hcl17": "d-MMWutIvhQ",
  "hcl18": "nIkqI5ERmoQ",
  "hcl19": "yPmtNaw_AZo",
  "hcl20": "PjrbLrCDBNQ",
  "hcl21": "2JLbcXyse1I",
  "hcl22": "kujjBSyB4Dk",
  "hcl23": "OiLx18q92uM",
  "hcl24": "TSVNEFxZ4D0",
  "hcl25": "8ZIrPIbvCyA",
  "hcl26": "fuZU0SF5uy4",
  "hcl27": "V_A47QWTN98",
  "hcl28": "FCHdw4wyrhI",
  "lodge1": "yJZxw9u7_DU",
  "lodge2": "yIZcxafGzXQ",
  "lodge3": "9ZjGeSFzCgE",
  "lodge4": "hpcKG_xl16c",
  "lodge5": "6I10JPRg-XM",
  "lodge6": "fHbEUDTuT68",
  "lodge7": "jQjuBFFbGbo",
  "lodge8": "JycXMxdnk2M",
  "lodge9": "PA8XtrwroQ8",
  "lodge10": "favMEUKGNKc",
  "lodge11": "hBo4-DsVx5A",
  "lodge12": "liWPL5KvURk",
  "lodge13": "GIKWvbclg7I",
  "lodge14": "s8waPVJwsZU",
  "lodge15": "cYbuojMWC-8",
  "lodge16": "0UFWJNZ1eZ0",
  "lodge18": "pqP_8xMOezc",
  "lodge19": "ckArt7M5hbs",
  "triton7": "jJeZntAfOp4",
  "latb1": "hg02g0fgIGU",
  "latb2": "udgiZS2DjUA",
  "latb3": "y4f0KyFQCYY",
  "latb4": "uzse0R3DRIE",
  "latb5": "9LwPkMqmWVs",
  "latb6": "tzf6iyT4PPA",
  "latb7": "a6e2ZJAxFA4",
  "latb8": "CBUvuMqxtOI",
  "latb9": "xaQPx_woep8",
  "latb10": "H6asYQPdNLI",
  "latb11": "WUNTafGZ3hg",
  "latb12": "VSY5wuJntQQ",
  "latb13": "8WRZavyihfE",
  "latb14": "ok-qJesuBxM",
  "latb15": "GJq0P7mqRac",
  "latb16": "cXGygoHy6qE",
  "tch1": "obkeMpIYOqY",
  "tch2": "Fy6I9DmPrmA",
  "tch3": "SrMLGKLwDZU",
  "tch4": "fwMTUYka6C8",
  "tch5": "jRRBUjmB1Cc",
  "tch6": "dEcwQDyzXsc",
  "tch7": "VJ7WnbHXRCw",
  "tch8": "mNhXY4U1kfo",
  "tch9": "Vqi3JkPpEQ8",
  "tch10": "qPSGmSw9-H0",
  "wsop1": "BdUvr_CXSxk",
  "wsop2": "NqPmIAvR82A",
  "wsop3": "bSwP4w2apPA",
  "wsop4": "dLBj_EziMKk",
  "wsop5": "-dXBX-iUw0Q",
  "wsop6": "yRJMtgIK9C8",
  "wsop7": "ZRSfWVI950c",
  "wsop8": "wFHgCRnx_JU",
  "wsop9": "gqH0Og9Z--k",
  "wsop10": "FAKEn51odop",
  "wsop11": "FAKE55t5pd5",
  "wsop12": "49FxwnBtCFQ",
  "wsop13": "o1SIuqZDz2E",
  "wsop14": "FAKEgswfzsu",
  "wsop15": "FAKEigvh110",
  "wpt1": "_4nrOGfFssE",
  "wpt2": "jAtJ6byQnxs",
  "wpt3": "uLEWtsmyark",
  "wpt4": "mxB5zK7fRBs",
  "wpt5": "XvxZSSX88Ac",
  "wpt6": "w1cpoOSqZ2o",
  "ept1": "IMbKeXfKb4c",
  "ept2": "KLgwpOWXiyE",
  "ept3": "X4oygINf-uo",
  "ept4": "0Wxi_hzgFGo",
  "ept5": "FpEJkBJVd00",
  "ept6": "33p282rfivw",
  "ept7": "FAKEc1v448x",
  "ept8": "FAKEvp9q9qm",
  "ept9": "FAKEfn79mbg",
  "ept10": "FAKExszt7pv",
  "ept11": "FAKE710frrv",
  "ept12": "FAKEa8a5u37",
  "vlog1": "P5OT-cOcTRs",
  "vlog2": "PalPSvIIxUg",
  "vlog3": "I-dJDxwatNo",
  "vlog4": "NKFFVY6Q37s",
  "vlog5": "HFPNAXxQjvQ",
  "vlog6": "pQ423SML2gc",
  "vlog7": "Ls4b65169-k",
  "vlog8": "zfDgGWh-si0",
  "vlog9": "_BeB0OkwCTw",
  "vlog10": "8XHhGlAfi-E",
  "vlog11": "mPHrT249LJ8",
  "vlog12": "Pv6yB5uM1Hw",
  "pgo1": "FAKE89dbizc",
  "pgo2": "FAKEfxvj1wx",
  "pgo3": "FAKEdxruw08",
  "pgo4": "FAKEi57mbzp",
  "pgo5": "FAKEip93sk4",
  "pgo6": "FAKErr1evhg",
  "neeme1": "VknSBaSAX2I",
  "neeme2": "qeItZFws2Hk",
  "neeme3": "Dwv4ekxyS3A",
  "neeme4": "rSQpzr24-fY",
  "neeme5": "vXBrOA-AHKY",
  "ramp1": "6vyO89eugpA",
  "ramp2": "IVGRM1OF-oo",
  "ramp3": "Fx3TLCUpRNc",
  "ramp4": "9ucgJSjFZc4",
  "ramp5": "UNDaUcrBGPY",
  "mari1": "uYVmCE6meLI",
  "mari2": "Wo1mGd8_XXE",
  "mari3": "uvCjBlQXupw",
  "mari4": "kCfNqGeHWpM",
  "wolf1": "CTZeYizF-g0",
  "wolf2": "clZ-r2QDcbY",
  "wolf3": "s0WWs2e2Vhc",
  "wolf4": "8XbnLzZIy7Q",
  "jl1": "dg016Stpa2k",
  "jl2": "GSzOSY_IcB4",
  "jl3": "nvFsvh4FNok",
  "jl4": "Dhlr255j55o",
  "jl5": "VrQCQnYlTaM",
  "polk1": "fhgYiIyxtSE",
  "polk2": "4kkx1r3YaAU",
  "polk3": "1RdN2cOf9do",
  "polk4": "fdY9bxBd_Sw",
  "polk5": "c_CMqUjKYCQ",
  "bart1": "6kzQkQD_UaM",
  "bart2": "8BJVttAf2Xo",
  "bart3": "IQRbD9z5sso",
  "bart4": "uRdY2woHpcw",
  "dn1": "9RMgHjToDFw",
  "dn2": "FGytzJRnXsg",
  "dn3": "AhfeoNu7EnA",
  "dn4": "3RQ5CyN_VGE",
  "dn5": "RTvaz9x7ER0",
  "ph1": "mjGLuIFfDAA",
  "ph2": "2FrUMbm-xuE",
  "ph3": "mYRLf222v9g",
  "ph4": "1WqM3CCw5rY",
  "pi1": "HY2V4mHdQJw",
  "pi2": "RC3ddhyKFOo",
  "pi3": "SMJ7C4atMi0",
  "pi4": "SIfMqu_IkaA",
  "td1": "AnGZfqtXIJk",
  "td2": "dS_uv88YuPs",
  "td3": "uC1pmdBTn6U",
  "td4": "mmcKrIqLfrk",
  "ga1": "9NNKjWscKWo",
  "ga2": "G_qXrxrzNvQ",
  "ga3": "iDQrDO4qC4A",
  "ga4": "3pnJjgNSYTQ"
});

export const VIDEO_LIBRARY_SOURCES = Object.freeze([
  {
    "id": "ALL",
    "name": "All Sources",
    "logo": null
  },
  {
    "id": "HCL",
    "name": "Hustler Casino Live",
    "logo": "/images/video-sources/hcl.webp"
  },
  {
    "id": "LODGE",
    "name": "The Lodge",
    "logo": "/images/video-sources/lodge.webp"
  },
  {
    "id": "TRITON",
    "name": "Triton Poker",
    "logo": "/images/video-sources/triton.jpg"
  },
  {
    "id": "LATB",
    "name": "Bally Poker Live",
    "logo": "/images/video-sources/latb.webp"
  },
  {
    "id": "TCH",
    "name": "TCH Live",
    "logo": "/images/video-sources/tch.webp"
  },
  {
    "id": "POKERGO",
    "name": "PokerGO",
    "logo": "/images/video-sources/pokergo.jpg"
  },
  {
    "id": "WSOP",
    "name": "WSOP",
    "logo": "/images/video-sources/wsop.webp"
  },
  {
    "id": "WPT",
    "name": "WPT",
    "logo": "/images/video-sources/wpt.jpg"
  },
  {
    "id": "EPT",
    "name": "EPT",
    "logo": "/images/video-sources/ept.jpg"
  },
  {
    "id": "BRAD_OWEN",
    "name": "Brad Owen",
    "logo": "/images/video-sources/brad_owen.webp"
  },
  {
    "id": "NEEME",
    "name": "Andrew Neeme",
    "logo": "/images/video-sources/neeme.jpg"
  },
  {
    "id": "RAMPAGE",
    "name": "Rampage Poker",
    "logo": "/images/video-sources/rampage.webp"
  },
  {
    "id": "MARIANO",
    "name": "Mariano",
    "logo": "/images/video-sources/mariano.webp"
  },
  {
    "id": "WOLFGANG",
    "name": "Wolfgang Poker",
    "logo": "/images/video-sources/wolfgang.webp"
  },
  {
    "id": "JOHNNIE",
    "name": "Johnnie Vibes",
    "logo": "/images/video-sources/johnnie.jpg"
  },
  {
    "id": "JLITTLE",
    "name": "Jonathan Little",
    "logo": "/images/video-sources/jlittle.jpg"
  },
  {
    "id": "POLK",
    "name": "Doug Polk",
    "logo": "/images/video-sources/polk.jpg"
  },
  {
    "id": "BART",
    "name": "Bart Hanson",
    "logo": "/images/video-sources/bart.jpg"
  },
  {
    "id": "UPSWING",
    "name": "Upswing Poker",
    "logo": "/images/video-sources/upswing.svg"
  },
  {
    "id": "NEGREANU",
    "name": "Daniel Negreanu",
    "logo": "/images/video-sources/negreanu.jpg"
  },
  {
    "id": "HELLMUTH",
    "name": "Phil Hellmuth",
    "logo": "/images/video-sources/hellmuth.jpg"
  },
  {
    "id": "IVEY",
    "name": "Phil Ivey",
    "logo": "/images/video-sources/ivey.jpg"
  },
  {
    "id": "DWAN",
    "name": "Tom Dwan",
    "logo": "/images/video-sources/dwan.webp"
  },
  {
    "id": "GARRETT",
    "name": "Garrett Adelstein",
    "logo": "/images/video-sources/garrett.webp"
  }
]);

