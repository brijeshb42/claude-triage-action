#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/debug.js
var require_debug = __commonJS({
  "node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/debug.js"(exports, module) {
    "use strict";
    var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {
    };
    module.exports = debug;
  }
});

// node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/constants.js
var require_constants = __commonJS({
  "node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/constants.js"(exports, module) {
    "use strict";
    var SEMVER_SPEC_VERSION = "2.0.0";
    var MAX_LENGTH = 256;
    var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
    9007199254740991;
    var MAX_SAFE_COMPONENT_LENGTH = 16;
    var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
    var RELEASE_TYPES = [
      "major",
      "premajor",
      "minor",
      "preminor",
      "patch",
      "prepatch",
      "prerelease"
    ];
    module.exports = {
      MAX_LENGTH,
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_SAFE_INTEGER,
      RELEASE_TYPES,
      SEMVER_SPEC_VERSION,
      FLAG_INCLUDE_PRERELEASE: 1,
      FLAG_LOOSE: 2
    };
  }
});

// node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/re.js
var require_re = __commonJS({
  "node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/re.js"(exports, module) {
    "use strict";
    var {
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_LENGTH
    } = require_constants();
    var debug = require_debug();
    exports = module.exports = {};
    var re = exports.re = [];
    var safeRe = exports.safeRe = [];
    var src = exports.src = [];
    var safeSrc = exports.safeSrc = [];
    var t = exports.t = {};
    var R = 0;
    var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
    var safeRegexReplacements = [
      ["\\s", 1],
      ["\\d", MAX_LENGTH],
      [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
    ];
    var makeSafeRegex = (value) => {
      for (const [token, max] of safeRegexReplacements) {
        value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
      }
      return value;
    };
    var createToken = (name, value, isGlobal) => {
      const safe = makeSafeRegex(value);
      const index = R++;
      debug(name, index, value);
      t[name] = index;
      src[index] = value;
      safeSrc[index] = safe;
      re[index] = new RegExp(value, isGlobal ? "g" : void 0);
      safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
    };
    createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
    createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
    createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
    createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
    createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIER]})`);
    createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
    createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
    createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
    createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
    createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
    createToken("FULL", `^${src[t.FULLPLAIN]}$`);
    createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
    createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
    createToken("GTLT", "((?:<|>)?=?)");
    createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
    createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
    createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
    createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
    createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
    createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?(?:${src[t.BUILD]})?(?:$|[^\\d])`);
    createToken("COERCERTL", src[t.COERCE], true);
    createToken("COERCERTLFULL", src[t.COERCEFULL], true);
    createToken("LONETILDE", "(?:~>?)");
    createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
    exports.tildeTrimReplace = "$1~";
    createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
    createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("LONECARET", "(?:\\^)");
    createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
    exports.caretTrimReplace = "$1^";
    createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
    createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
    createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
    createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
    exports.comparatorTrimReplace = "$1$2$3";
    createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
    createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
    createToken("STAR", "(<|>)?=?\\s*\\*");
    createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
    createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
  }
});

// node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/parse-options.js
var require_parse_options = __commonJS({
  "node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/parse-options.js"(exports, module) {
    "use strict";
    var looseOption = Object.freeze({ loose: true });
    var emptyOpts = Object.freeze({});
    var parseOptions = (options) => {
      if (!options) {
        return emptyOpts;
      }
      if (typeof options !== "object") {
        return looseOption;
      }
      return options;
    };
    module.exports = parseOptions;
  }
});

// node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/identifiers.js
var require_identifiers = __commonJS({
  "node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/identifiers.js"(exports, module) {
    "use strict";
    var numeric = /^[0-9]+$/;
    var compareIdentifiers = (a, b) => {
      if (typeof a === "number" && typeof b === "number") {
        return a === b ? 0 : a < b ? -1 : 1;
      }
      const anum = numeric.test(a);
      const bnum = numeric.test(b);
      if (anum && bnum) {
        a = +a;
        b = +b;
      }
      return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
    };
    var rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
    module.exports = {
      compareIdentifiers,
      rcompareIdentifiers
    };
  }
});

// node_modules/.pnpm/semver@7.8.5/node_modules/semver/classes/semver.js
var require_semver = __commonJS({
  "node_modules/.pnpm/semver@7.8.5/node_modules/semver/classes/semver.js"(exports, module) {
    "use strict";
    var debug = require_debug();
    var { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants();
    var { safeRe: re, t } = require_re();
    var parseOptions = require_parse_options();
    var { compareIdentifiers } = require_identifiers();
    var isPrereleaseIdentifier = (prerelease, identifier) => {
      const identifiers = identifier.split(".");
      if (identifiers.length > prerelease.length) {
        return false;
      }
      for (let i = 0; i < identifiers.length; i++) {
        if (compareIdentifiers(prerelease[i], identifiers[i]) !== 0) {
          return false;
        }
      }
      return true;
    };
    var SemVer = class _SemVer {
      constructor(version, options) {
        options = parseOptions(options);
        if (version instanceof _SemVer) {
          if (version.loose === !!options.loose && version.includePrerelease === !!options.includePrerelease) {
            return version;
          } else {
            version = version.version;
          }
        } else if (typeof version !== "string") {
          throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
        }
        if (version.length > MAX_LENGTH) {
          throw new TypeError(
            `version is longer than ${MAX_LENGTH} characters`
          );
        }
        debug("SemVer", version, options);
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
        if (!m) {
          throw new TypeError(`Invalid Version: ${version}`);
        }
        this.raw = version;
        this.major = +m[1];
        this.minor = +m[2];
        this.patch = +m[3];
        if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
          throw new TypeError("Invalid major version");
        }
        if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
          throw new TypeError("Invalid minor version");
        }
        if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
          throw new TypeError("Invalid patch version");
        }
        if (!m[4]) {
          this.prerelease = [];
        } else {
          this.prerelease = m[4].split(".").map((id) => {
            if (/^[0-9]+$/.test(id)) {
              const num = +id;
              if (num >= 0 && num < MAX_SAFE_INTEGER) {
                return num;
              }
            }
            return id;
          });
        }
        this.build = m[5] ? m[5].split(".") : [];
        this.format();
      }
      format() {
        this.version = `${this.major}.${this.minor}.${this.patch}`;
        if (this.prerelease.length) {
          this.version += `-${this.prerelease.join(".")}`;
        }
        return this.version;
      }
      toString() {
        return this.version;
      }
      compare(other) {
        debug("SemVer.compare", this.version, this.options, other);
        if (!(other instanceof _SemVer)) {
          if (typeof other === "string" && other === this.version) {
            return 0;
          }
          other = new _SemVer(other, this.options);
        }
        if (other.version === this.version) {
          return 0;
        }
        return this.compareMain(other) || this.comparePre(other);
      }
      compareMain(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.major < other.major) {
          return -1;
        }
        if (this.major > other.major) {
          return 1;
        }
        if (this.minor < other.minor) {
          return -1;
        }
        if (this.minor > other.minor) {
          return 1;
        }
        if (this.patch < other.patch) {
          return -1;
        }
        if (this.patch > other.patch) {
          return 1;
        }
        return 0;
      }
      comparePre(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.prerelease.length && !other.prerelease.length) {
          return -1;
        } else if (!this.prerelease.length && other.prerelease.length) {
          return 1;
        } else if (!this.prerelease.length && !other.prerelease.length) {
          return 0;
        }
        let i = 0;
        do {
          const a = this.prerelease[i];
          const b = other.prerelease[i];
          debug("prerelease compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      compareBuild(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        let i = 0;
        do {
          const a = this.build[i];
          const b = other.build[i];
          debug("build compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      // preminor will bump the version up to the next minor release, and immediately
      // down to pre-release. premajor and prepatch work the same way.
      inc(release, identifier, identifierBase) {
        if (release.startsWith("pre")) {
          if (!identifier && identifierBase === false) {
            throw new Error("invalid increment argument: identifier is empty");
          }
          if (identifier) {
            const match = `-${identifier}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE]);
            if (!match || match[1] !== identifier) {
              throw new Error(`invalid identifier: ${identifier}`);
            }
          }
        }
        switch (release) {
          case "premajor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor = 0;
            this.major++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "preminor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "prepatch":
            this.prerelease.length = 0;
            this.inc("patch", identifier, identifierBase);
            this.inc("pre", identifier, identifierBase);
            break;
          // If the input is a non-prerelease version, this acts the same as
          // prepatch.
          case "prerelease":
            if (this.prerelease.length === 0) {
              this.inc("patch", identifier, identifierBase);
            }
            this.inc("pre", identifier, identifierBase);
            break;
          case "release":
            if (this.prerelease.length === 0) {
              throw new Error(`version ${this.raw} is not a prerelease`);
            }
            this.prerelease.length = 0;
            break;
          case "major":
            if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
              this.major++;
            }
            this.minor = 0;
            this.patch = 0;
            this.prerelease = [];
            break;
          case "minor":
            if (this.patch !== 0 || this.prerelease.length === 0) {
              this.minor++;
            }
            this.patch = 0;
            this.prerelease = [];
            break;
          case "patch":
            if (this.prerelease.length === 0) {
              this.patch++;
            }
            this.prerelease = [];
            break;
          // This probably shouldn't be used publicly.
          // 1.0.0 'pre' would become 1.0.0-0 which is the wrong direction.
          case "pre": {
            const base = Number(identifierBase) ? 1 : 0;
            if (this.prerelease.length === 0) {
              this.prerelease = [base];
            } else {
              let i = this.prerelease.length;
              while (--i >= 0) {
                if (typeof this.prerelease[i] === "number") {
                  this.prerelease[i]++;
                  i = -2;
                }
              }
              if (i === -1) {
                if (identifier === this.prerelease.join(".") && identifierBase === false) {
                  throw new Error("invalid increment argument: identifier already exists");
                }
                this.prerelease.push(base);
              }
            }
            if (identifier) {
              let prerelease = [identifier, base];
              if (identifierBase === false) {
                prerelease = [identifier];
              }
              if (isPrereleaseIdentifier(this.prerelease, identifier)) {
                const prereleaseBase = this.prerelease[identifier.split(".").length];
                if (isNaN(prereleaseBase)) {
                  this.prerelease = prerelease;
                }
              } else {
                this.prerelease = prerelease;
              }
            }
            break;
          }
          default:
            throw new Error(`invalid increment argument: ${release}`);
        }
        this.raw = this.format();
        if (this.build.length) {
          this.raw += `+${this.build.join(".")}`;
        }
        return this;
      }
    };
    module.exports = SemVer;
  }
});

// node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/compare.js
var require_compare = __commonJS({
  "node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/compare.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var compare2 = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
    module.exports = compare2;
  }
});

// node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/lrucache.js
var require_lrucache = __commonJS({
  "node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/lrucache.js"(exports, module) {
    "use strict";
    var LRUCache = class {
      constructor() {
        this.max = 1e3;
        this.map = /* @__PURE__ */ new Map();
      }
      get(key) {
        const value = this.map.get(key);
        if (value === void 0) {
          return void 0;
        } else {
          this.map.delete(key);
          this.map.set(key, value);
          return value;
        }
      }
      delete(key) {
        return this.map.delete(key);
      }
      set(key, value) {
        const deleted = this.delete(key);
        if (!deleted && value !== void 0) {
          if (this.map.size >= this.max) {
            const firstKey = this.map.keys().next().value;
            this.delete(firstKey);
          }
          this.map.set(key, value);
        }
        return this;
      }
    };
    module.exports = LRUCache;
  }
});

// node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/eq.js
var require_eq = __commonJS({
  "node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/eq.js"(exports, module) {
    "use strict";
    var compare2 = require_compare();
    var eq = (a, b, loose) => compare2(a, b, loose) === 0;
    module.exports = eq;
  }
});

// node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/neq.js
var require_neq = __commonJS({
  "node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/neq.js"(exports, module) {
    "use strict";
    var compare2 = require_compare();
    var neq = (a, b, loose) => compare2(a, b, loose) !== 0;
    module.exports = neq;
  }
});

// node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/gt.js
var require_gt = __commonJS({
  "node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/gt.js"(exports, module) {
    "use strict";
    var compare2 = require_compare();
    var gt = (a, b, loose) => compare2(a, b, loose) > 0;
    module.exports = gt;
  }
});

// node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/gte.js
var require_gte = __commonJS({
  "node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/gte.js"(exports, module) {
    "use strict";
    var compare2 = require_compare();
    var gte = (a, b, loose) => compare2(a, b, loose) >= 0;
    module.exports = gte;
  }
});

// node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/lt.js
var require_lt = __commonJS({
  "node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/lt.js"(exports, module) {
    "use strict";
    var compare2 = require_compare();
    var lt = (a, b, loose) => compare2(a, b, loose) < 0;
    module.exports = lt;
  }
});

// node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/lte.js
var require_lte = __commonJS({
  "node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/lte.js"(exports, module) {
    "use strict";
    var compare2 = require_compare();
    var lte = (a, b, loose) => compare2(a, b, loose) <= 0;
    module.exports = lte;
  }
});

// node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/cmp.js
var require_cmp = __commonJS({
  "node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/cmp.js"(exports, module) {
    "use strict";
    var eq = require_eq();
    var neq = require_neq();
    var gt = require_gt();
    var gte = require_gte();
    var lt = require_lt();
    var lte = require_lte();
    var cmp = (a, op, b, loose) => {
      switch (op) {
        case "===":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a === b;
        case "!==":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a !== b;
        case "":
        case "=":
        case "==":
          return eq(a, b, loose);
        case "!=":
          return neq(a, b, loose);
        case ">":
          return gt(a, b, loose);
        case ">=":
          return gte(a, b, loose);
        case "<":
          return lt(a, b, loose);
        case "<=":
          return lte(a, b, loose);
        default:
          throw new TypeError(`Invalid operator: ${op}`);
      }
    };
    module.exports = cmp;
  }
});

// node_modules/.pnpm/semver@7.8.5/node_modules/semver/classes/comparator.js
var require_comparator = __commonJS({
  "node_modules/.pnpm/semver@7.8.5/node_modules/semver/classes/comparator.js"(exports, module) {
    "use strict";
    var ANY = /* @__PURE__ */ Symbol("SemVer ANY");
    var Comparator = class _Comparator {
      static get ANY() {
        return ANY;
      }
      constructor(comp, options) {
        options = parseOptions(options);
        if (comp instanceof _Comparator) {
          if (comp.loose === !!options.loose) {
            return comp;
          } else {
            comp = comp.value;
          }
        }
        comp = comp.trim().split(/\s+/).join(" ");
        debug("comparator", comp, options);
        this.options = options;
        this.loose = !!options.loose;
        this.parse(comp);
        if (this.semver === ANY) {
          this.value = "";
        } else {
          this.value = this.operator + this.semver.version;
        }
        debug("comp", this);
      }
      parse(comp) {
        const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
        const m = comp.match(r);
        if (!m) {
          throw new TypeError(`Invalid comparator: ${comp}`);
        }
        this.operator = m[1] !== void 0 ? m[1] : "";
        if (this.operator === "=") {
          this.operator = "";
        }
        if (!m[2]) {
          this.semver = ANY;
        } else {
          this.semver = new SemVer(m[2], this.options.loose);
        }
      }
      toString() {
        return this.value;
      }
      test(version) {
        debug("Comparator.test", version, this.options.loose);
        if (this.semver === ANY || version === ANY) {
          return true;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        return cmp(version, this.operator, this.semver, this.options);
      }
      intersects(comp, options) {
        if (!(comp instanceof _Comparator)) {
          throw new TypeError("a Comparator is required");
        }
        if (this.operator === "") {
          if (this.value === "") {
            return true;
          }
          return new Range(comp.value, options).test(this.value);
        } else if (comp.operator === "") {
          if (comp.value === "") {
            return true;
          }
          return new Range(this.value, options).test(comp.semver);
        }
        options = parseOptions(options);
        if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
          return false;
        }
        if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
          return false;
        }
        if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
          return true;
        }
        if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
          return true;
        }
        if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
          return true;
        }
        if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
          return true;
        }
        if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
          return true;
        }
        return false;
      }
    };
    module.exports = Comparator;
    var parseOptions = require_parse_options();
    var { safeRe: re, t } = require_re();
    var cmp = require_cmp();
    var debug = require_debug();
    var SemVer = require_semver();
    var Range = require_range();
  }
});

// node_modules/.pnpm/semver@7.8.5/node_modules/semver/classes/range.js
var require_range = __commonJS({
  "node_modules/.pnpm/semver@7.8.5/node_modules/semver/classes/range.js"(exports, module) {
    "use strict";
    var SPACE_CHARACTERS = /\s+/g;
    var Range = class _Range {
      constructor(range, options) {
        options = parseOptions(options);
        if (range instanceof _Range) {
          if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) {
            return range;
          } else {
            return new _Range(range.raw, options);
          }
        }
        if (range instanceof Comparator) {
          this.raw = range.value;
          this.set = [[range]];
          this.formatted = void 0;
          return this;
        }
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        this.raw = range.trim().replace(SPACE_CHARACTERS, " ");
        this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
        if (!this.set.length) {
          throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
        }
        if (this.set.length > 1) {
          const first = this.set[0];
          this.set = this.set.filter((c) => !isNullSet(c[0]));
          if (this.set.length === 0) {
            this.set = [first];
          } else if (this.set.length > 1) {
            for (const c of this.set) {
              if (c.length === 1 && isAny(c[0])) {
                this.set = [c];
                break;
              }
            }
          }
        }
        this.formatted = void 0;
      }
      get range() {
        if (this.formatted === void 0) {
          this.formatted = "";
          for (let i = 0; i < this.set.length; i++) {
            if (i > 0) {
              this.formatted += "||";
            }
            const comps = this.set[i];
            for (let k = 0; k < comps.length; k++) {
              if (k > 0) {
                this.formatted += " ";
              }
              this.formatted += comps[k].toString().trim();
            }
          }
        }
        return this.formatted;
      }
      format() {
        return this.range;
      }
      toString() {
        return this.range;
      }
      parseRange(range) {
        range = range.replace(BUILDSTRIPRE, "");
        const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
        const memoKey = memoOpts + ":" + range;
        const cached = cache.get(memoKey);
        if (cached) {
          return cached;
        }
        const loose = this.options.loose;
        const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
        range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
        debug("hyphen replace", range);
        range = range.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
        debug("comparator trim", range);
        range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
        debug("tilde trim", range);
        range = range.replace(re[t.CARETTRIM], caretTrimReplace);
        debug("caret trim", range);
        let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
        if (loose) {
          rangeList = rangeList.filter((comp) => {
            debug("loose invalid filter", comp, this.options);
            return !!comp.match(re[t.COMPARATORLOOSE]);
          });
        }
        debug("range list", rangeList);
        const rangeMap = /* @__PURE__ */ new Map();
        const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
        for (const comp of comparators) {
          if (isNullSet(comp)) {
            return [comp];
          }
          rangeMap.set(comp.value, comp);
        }
        if (rangeMap.size > 1 && rangeMap.has("")) {
          rangeMap.delete("");
        }
        const result = [...rangeMap.values()];
        cache.set(memoKey, result);
        return result;
      }
      intersects(range, options) {
        if (!(range instanceof _Range)) {
          throw new TypeError("a Range is required");
        }
        return this.set.some((thisComparators) => {
          return isSatisfiable(thisComparators, options) && range.set.some((rangeComparators) => {
            return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
              return rangeComparators.every((rangeComparator) => {
                return thisComparator.intersects(rangeComparator, options);
              });
            });
          });
        });
      }
      // if ANY of the sets match ALL of its comparators, then pass
      test(version) {
        if (!version) {
          return false;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        for (let i = 0; i < this.set.length; i++) {
          if (testSet(this.set[i], version, this.options)) {
            return true;
          }
        }
        return false;
      }
    };
    module.exports = Range;
    var LRU = require_lrucache();
    var cache = new LRU();
    var parseOptions = require_parse_options();
    var Comparator = require_comparator();
    var debug = require_debug();
    var SemVer = require_semver();
    var {
      safeRe: re,
      src,
      t,
      comparatorTrimReplace,
      tildeTrimReplace,
      caretTrimReplace
    } = require_re();
    var { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants();
    var BUILDSTRIPRE = new RegExp(src[t.BUILD], "g");
    var isNullSet = (c) => c.value === "<0.0.0-0";
    var isAny = (c) => c.value === "";
    var isSatisfiable = (comparators, options) => {
      let result = true;
      const remainingComparators = comparators.slice();
      let testComparator = remainingComparators.pop();
      while (result && remainingComparators.length) {
        result = remainingComparators.every((otherComparator) => {
          return testComparator.intersects(otherComparator, options);
        });
        testComparator = remainingComparators.pop();
      }
      return result;
    };
    var parseComparator = (comp, options) => {
      comp = comp.replace(re[t.BUILD], "");
      debug("comp", comp, options);
      comp = replaceCarets(comp, options);
      debug("caret", comp);
      comp = replaceTildes(comp, options);
      debug("tildes", comp);
      comp = replaceXRanges(comp, options);
      debug("xrange", comp);
      comp = replaceStars(comp, options);
      debug("stars", comp);
      return comp;
    };
    var isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
    var invalidXRangeOrder = (M, m, p) => isX(M) && !isX(m) || isX(m) && p && !isX(p);
    var replaceTildes = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
    };
    var replaceTilde = (comp, options) => {
      const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("tilde", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
        } else if (pr) {
          debug("replaceTilde pr", pr);
          ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
        } else {
          ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
        }
        debug("tilde return", ret);
        return ret;
      });
    };
    var replaceCarets = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
    };
    var replaceCaret = (comp, options) => {
      debug("caret", comp, options);
      const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("caret", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          if (M === "0") {
            ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
          } else {
            ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
          }
        } else if (pr) {
          debug("replaceCaret pr", pr);
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
          }
        } else {
          debug("no pr");
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
          }
        }
        debug("caret return", ret);
        return ret;
      });
    };
    var replaceXRanges = (comp, options) => {
      debug("replaceXRanges", comp, options);
      return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
    };
    var replaceXRange = (comp, options) => {
      comp = comp.trim();
      const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
      return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
        debug("xRange", comp, ret, gtlt, M, m, p, pr);
        if (invalidXRangeOrder(M, m, p)) {
          return comp;
        }
        const xM = isX(M);
        const xm = xM || isX(m);
        const xp = xm || isX(p);
        const anyX = xp;
        if (gtlt === "=" && anyX) {
          gtlt = "";
        }
        pr = options.includePrerelease ? "-0" : "";
        if (xM) {
          if (gtlt === ">" || gtlt === "<") {
            ret = "<0.0.0-0";
          } else {
            ret = "*";
          }
        } else if (gtlt && anyX) {
          if (xm) {
            m = 0;
          }
          p = 0;
          if (gtlt === ">") {
            gtlt = ">=";
            if (xm) {
              M = +M + 1;
              m = 0;
              p = 0;
            } else {
              m = +m + 1;
              p = 0;
            }
          } else if (gtlt === "<=") {
            gtlt = "<";
            if (xm) {
              M = +M + 1;
            } else {
              m = +m + 1;
            }
          }
          if (gtlt === "<") {
            pr = "-0";
          }
          ret = `${gtlt + M}.${m}.${p}${pr}`;
        } else if (xm) {
          ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
        } else if (xp) {
          ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
        }
        debug("xRange return", ret);
        return ret;
      });
    };
    var replaceStars = (comp, options) => {
      debug("replaceStars", comp, options);
      return comp.trim().replace(re[t.STAR], "");
    };
    var replaceGTE0 = (comp, options) => {
      debug("replaceGTE0", comp, options);
      return comp.trim().replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
    };
    var hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
      if (isX(fM)) {
        from = "";
      } else if (isX(fm)) {
        from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
      } else if (isX(fp)) {
        from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
      } else if (fpr) {
        from = `>=${from}`;
      } else {
        from = `>=${from}${incPr ? "-0" : ""}`;
      }
      if (isX(tM)) {
        to = "";
      } else if (isX(tm)) {
        to = `<${+tM + 1}.0.0-0`;
      } else if (isX(tp)) {
        to = `<${tM}.${+tm + 1}.0-0`;
      } else if (tpr) {
        to = `<=${tM}.${tm}.${tp}-${tpr}`;
      } else if (incPr) {
        to = `<${tM}.${tm}.${+tp + 1}-0`;
      } else {
        to = `<=${to}`;
      }
      return `${from} ${to}`.trim();
    };
    var testSet = (set, version, options) => {
      for (let i = 0; i < set.length; i++) {
        if (!set[i].test(version)) {
          return false;
        }
      }
      if (version.prerelease.length && !options.includePrerelease) {
        for (let i = 0; i < set.length; i++) {
          debug(set[i].semver);
          if (set[i].semver === Comparator.ANY) {
            continue;
          }
          if (set[i].semver.prerelease.length > 0) {
            const allowed = set[i].semver;
            if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) {
              return true;
            }
          }
        }
        return false;
      }
      return true;
    };
  }
});

// node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/satisfies.js
var require_satisfies = __commonJS({
  "node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/satisfies.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var satisfies2 = (version, range, options) => {
      try {
        range = new Range(range, options);
      } catch (er) {
        return false;
      }
      return range.test(version);
    };
    module.exports = satisfies2;
  }
});

// node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/valid.js
var require_valid = __commonJS({
  "node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/valid.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var validRange2 = (range, options) => {
      try {
        return new Range(range, options).range || "*";
      } catch (er) {
        return null;
      }
    };
    module.exports = validRange2;
  }
});

// src/sandbox-cli.ts
import { readFile as readFile2, writeFile } from "node:fs/promises";
import * as path3 from "node:path";
import { pathToFileURL } from "node:url";

// src/archive.ts
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdtemp, open, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var DEFAULT_ARCHIVE_PART_BYTES = 16 * 1024 * 1024;
function exclusionPathspec(pattern) {
  if (!pattern || pattern.includes("\0") || pattern.startsWith("/") || pattern.startsWith(":") || pattern.split("/").includes("..")) {
    throw new Error(
      `Snapshot exclusion must be a non-empty repository-relative Git pathspec: ${JSON.stringify(pattern)}.`
    );
  }
  return `:(exclude)${pattern}`;
}
async function trackedFiles(repositoryDirectory, excludedPathspecs) {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "-z", "--", ".", ...excludedPathspecs.map(exclusionPathspec)],
    {
      cwd: repositoryDirectory,
      encoding: "buffer",
      maxBuffer: 128 * 1024 * 1024
    }
  );
  const names = stdout.toString("utf8").split("\0").filter((name) => name.length > 0);
  return Promise.all(
    names.map(async (name) => {
      const metadata = await lstat(path.join(repositoryDirectory, name));
      if (metadata.isDirectory()) {
        throw new Error(
          `Tracked path ${JSON.stringify(name)} is a directory. Git submodules are not supported yet.`
        );
      }
      return { name };
    })
  );
}
async function createTar(archiveSourceDirectory, destination, files) {
  await new Promise((resolve2, reject) => {
    const tarProcess = spawn(
      "tar",
      ["--gzip", "--null", "--no-recursion", "--create", "--file", destination, "--files-from=-"],
      { cwd: archiveSourceDirectory, stdio: ["pipe", "inherit", "inherit"] }
    );
    tarProcess.once("error", reject);
    tarProcess.once("exit", (exitCode) => {
      if (exitCode === 0) {
        resolve2();
      } else {
        reject(new Error(`tar exited with code ${exitCode ?? "unknown"}.`));
      }
    });
    tarProcess.stdin.end(`${files.map((file) => `repo/${file.name}`).join("\0")}\0`);
  });
}
async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}
async function createRepositoryArchive(repositoryDirectory, partBytes = DEFAULT_ARCHIVE_PART_BYTES, excludedPathspecs = []) {
  if (!Number.isSafeInteger(partBytes) || partBytes <= 0) {
    throw new Error("Archive part size must be a positive safe integer.");
  }
  const files = await trackedFiles(repositoryDirectory, excludedPathspecs);
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "claude-triage-archive-"));
  const archivePath = path.join(temporaryDirectory, "repository.tar.gz");
  try {
    await symlink(repositoryDirectory, path.join(temporaryDirectory, "repo"), "dir");
    await createTar(temporaryDirectory, archivePath, files);
    const archiveStats = await stat(archivePath);
    return {
      path: archivePath,
      byteLength: archiveStats.size,
      fileCount: files.length,
      partBytes,
      partCount: Math.ceil(archiveStats.size / partBytes),
      sha256: await sha256File(archivePath),
      dispose: async () => {
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
    };
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}
async function* readArchiveParts(archivePath, partBytes = DEFAULT_ARCHIVE_PART_BYTES) {
  if (!Number.isSafeInteger(partBytes) || partBytes <= 0) {
    throw new Error("Archive part size must be a positive safe integer.");
  }
  const archive = await open(archivePath, "r");
  let index = 0;
  try {
    while (true) {
      const buffer = Buffer.allocUnsafe(partBytes);
      const { bytesRead } = await archive.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) {
        break;
      }
      yield { bytes: buffer.subarray(0, bytesRead), index };
      index += 1;
    }
  } finally {
    await archive.close();
  }
}

// src/bridge-client.ts
var DEFAULT_REQUEST_TIMEOUT_MS = 6e4;
var EXEC_REQUEST_GRACE_MS = 3e4;
function appendWithLimit(current, addition, limit) {
  if (current.length >= limit) {
    return { value: current, truncated: addition.length > 0 };
  }
  const remaining = limit - current.length;
  if (addition.length <= remaining) {
    return { value: current + addition, truncated: false };
  }
  return { value: current + addition.slice(0, remaining), truncated: true };
}
function parseEvents(payload) {
  return payload.split(/\r?\n\r?\n/).map((block) => {
    let event = "";
    const data = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        data.push(line.slice("data:".length).trimStart());
      }
    }
    return { event, data: data.join("\n") };
  }).filter((entry) => entry.event.length > 0);
}
function encodeFilePath(filePath) {
  return filePath.replace(/^\/+/, "").split("/").map((segment) => encodeURIComponent(segment)).join("/");
}
function parseExecSse(payload, maxOutputChars = 1e5) {
  let stdout = "";
  let stderr = "";
  let stdoutTruncated = false;
  let stderrTruncated = false;
  let exitCode;
  for (const entry of parseEvents(payload)) {
    if (entry.event === "stdout" || entry.event === "stderr") {
      const decoded = Buffer.from(entry.data, "base64").toString("utf8");
      if (entry.event === "stdout") {
        const appended = appendWithLimit(stdout, decoded, maxOutputChars);
        stdout = appended.value;
        stdoutTruncated ||= appended.truncated;
      } else {
        const appended = appendWithLimit(stderr, decoded, maxOutputChars);
        stderr = appended.value;
        stderrTruncated ||= appended.truncated;
      }
      continue;
    }
    if (entry.event === "exit") {
      const value = JSON.parse(entry.data);
      if (typeof value !== "object" || value === null || !("exit_code" in value) || typeof value.exit_code !== "number") {
        throw new Error("Sandbox Bridge returned an invalid exit event.");
      }
      exitCode = value.exit_code;
      continue;
    }
    if (entry.event === "error") {
      const value = JSON.parse(entry.data);
      const message = typeof value === "object" && value !== null && "error" in value ? String(value.error) : entry.data;
      throw new Error(`Sandbox command failed: ${message}`);
    }
  }
  if (exitCode === void 0) {
    throw new Error("Sandbox Bridge command stream ended without an exit event.");
  }
  return { exitCode, stdout, stderr, stdoutTruncated, stderrTruncated };
}
var SandboxBridgeClient = class {
  #apiUrl;
  #apiKey;
  constructor(apiUrl, apiKey) {
    this.#apiUrl = new URL(apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`);
    if (this.#apiUrl.protocol !== "https:" && this.#apiUrl.hostname !== "localhost") {
      throw new Error("Sandbox Bridge URL must use HTTPS outside localhost.");
    }
    if (!apiKey) {
      throw new Error("Sandbox Bridge API key is required.");
    }
    this.#apiKey = apiKey;
  }
  async #request(relativePath, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.#apiKey}`);
    const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, ...requestInit } = init;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    let response;
    try {
      response = await fetch(new URL(relativePath, this.#apiUrl), {
        ...requestInit,
        headers,
        signal: requestInit.signal ? AbortSignal.any([requestInit.signal, timeoutSignal]) : timeoutSignal
      });
    } catch (error) {
      if (timeoutSignal.aborted) {
        throw new Error(
          `Sandbox Bridge request timed out after ${timeoutMs}ms: ${requestInit.method ?? "GET"} ${relativePath}`,
          { cause: error }
        );
      }
      throw error;
    }
    if (!response.ok) {
      const body = (await response.text()).slice(0, 4e3);
      throw new Error(
        `Sandbox Bridge request failed: ${requestInit.method ?? "GET"} ${relativePath} returned ${response.status}: ${body}`
      );
    }
    return response;
  }
  async create() {
    const response = await this.#request("v1/sandbox", { method: "POST" });
    const value = await response.json();
    if (typeof value !== "object" || value === null || !("id" in value) || typeof value.id !== "string" || !value.id) {
      throw new Error("Sandbox Bridge returned an invalid sandbox ID.");
    }
    return value.id;
  }
  async destroy(sandboxId) {
    await this.#request(`v1/sandbox/${encodeURIComponent(sandboxId)}`, { method: "DELETE" });
  }
  async readFile(sandboxId, filePath, signal) {
    const relativePath = encodeFilePath(filePath);
    const response = await this.#request(
      `v1/sandbox/${encodeURIComponent(sandboxId)}/file/${relativePath}`,
      signal ? { signal } : {}
    );
    return response.text();
  }
  async writeFile(sandboxId, filePath, content, signal) {
    const relativePath = encodeFilePath(filePath);
    await this.#request(`v1/sandbox/${encodeURIComponent(sandboxId)}/file/${relativePath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: typeof content === "string" ? content : new Uint8Array(content).buffer,
      ...signal ? { signal } : {}
    });
  }
  async exec(sandboxId, argv, options = {}) {
    const commandTimeoutMs = options.timeoutMs ?? 12e4;
    const response = await this.#request(`v1/sandbox/${encodeURIComponent(sandboxId)}/exec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        argv,
        cwd: options.cwd ?? "/workspace/repo",
        timeout_ms: commandTimeoutMs
      }),
      ...options.signal ? { signal: options.signal } : {},
      timeoutMs: commandTimeoutMs + EXEC_REQUEST_GRACE_MS
    });
    return parseExecSse(await response.text(), options.maxOutputChars);
  }
};

// src/config.ts
function requiredEnvironmentVariable(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
function loadBridgeEnvironment() {
  return {
    apiUrl: requiredEnvironmentVariable("SANDBOX_API_URL"),
    apiKey: requiredEnvironmentVariable("SANDBOX_API_KEY")
  };
}

// src/node-runtime.ts
var import_compare = __toESM(require_compare(), 1);
var import_satisfies = __toESM(require_satisfies(), 1);
var import_valid = __toESM(require_valid(), 1);
import { lstat as lstat2, readFile } from "node:fs/promises";
import * as path2 from "node:path";

// src/node-command.ts
function assertNodeBinPath(nodeBinPath) {
  if (nodeBinPath !== "/usr/local/bin" && !/^\/workspace\/\.claude-triage\/node\/v\d+\.\d+\.\d+\/bin$/.test(nodeBinPath)) {
    throw new Error(`Unexpected sandbox Node.js binary path: ${nodeBinPath}.`);
  }
}

// src/node-runtime.ts
var DEFAULT_NODE_VERSION = "22.23.2";
var NODE_DOWNLOAD_ROOT = "https://nodejs.org/download/release";
var NODE_RELEASE_INDEX_URL = "https://nodejs.org/dist/index.json";
var TOOLCHAIN_ROOT = "/workspace/.claude-triage/node";
function nonEmptyVersion(value) {
  const firstLine = value?.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return firstLine?.replace(/^v(?=\d)/, "");
}
function parsePackageJson(packageJson) {
  if (!packageJson) {
    return {};
  }
  const value = JSON.parse(packageJson);
  if (typeof value !== "object" || value === null) {
    throw new Error("The root package.json must contain a JSON object.");
  }
  const engines = "engines" in value ? value.engines : void 0;
  const volta = "volta" in value ? value.volta : void 0;
  const enginesNode = typeof engines === "object" && engines !== null && "node" in engines && typeof engines.node === "string" ? engines.node.trim() : void 0;
  const voltaNode = typeof volta === "object" && volta !== null && "node" in volta && typeof volta.node === "string" ? volta.node.trim() : void 0;
  return {
    ...enginesNode ? { enginesNode } : {},
    ...voltaNode ? { voltaNode } : {}
  };
}
function detectNodeRequirement(sources, requestedVersion = "auto") {
  const normalizedRequestedVersion = requestedVersion.trim();
  if (normalizedRequestedVersion !== "auto") {
    return { range: normalizedRequestedVersion, source: "action input" };
  }
  const packageConfiguration = parsePackageJson(sources.packageJson);
  if (packageConfiguration.enginesNode) {
    return { range: packageConfiguration.enginesNode, source: "package.json#engines.node" };
  }
  const nodeVersion = nonEmptyVersion(sources.nodeVersionFile);
  if (nodeVersion) {
    return { range: nodeVersion, source: ".node-version" };
  }
  const nvmrc = nonEmptyVersion(sources.nvmrc);
  if (nvmrc) {
    return { range: nvmrc, source: ".nvmrc" };
  }
  if (packageConfiguration.voltaNode) {
    return { range: packageConfiguration.voltaNode, source: "package.json#volta.node" };
  }
  return { range: DEFAULT_NODE_VERSION, source: "sandbox image fallback" };
}
function isPublishedNodeRelease(value) {
  return typeof value === "object" && value !== null && "version" in value && typeof value.version === "string" && (!("files" in value) || Array.isArray(value.files) && value.files.every((entry) => typeof entry === "string"));
}
function selectMinimumPublishedNodeRelease(range, releases) {
  if (!range || range.length > 200 || !(0, import_valid.default)(range)) {
    throw new Error(`Invalid Node.js version range: ${JSON.stringify(range)}.`);
  }
  const matchingVersions = releases.filter((release) => release.files?.includes("linux-x64")).map((release) => release.version.replace(/^v/, "")).filter((version2) => (0, import_satisfies.default)(version2, range)).sort(import_compare.default);
  const version = matchingVersions[0];
  if (!version) {
    throw new Error(`No published linux-x64 Node.js release satisfies ${JSON.stringify(range)}.`);
  }
  return { version, archiveName: `node-v${version}-linux-x64.tar.xz` };
}
function findNodeArchiveChecksum(manifest, archiveName) {
  for (const line of manifest.split(/\r?\n/)) {
    const [checksum, filename, extra] = line.trim().split(/\s+/);
    if (filename === archiveName && extra === void 0 && checksum !== void 0 && /^[a-f0-9]{64}$/.test(checksum)) {
      return checksum;
    }
  }
  throw new Error(`Node.js checksum manifest does not contain ${archiveName}.`);
}
async function readOptionalRegularFile(filePath) {
  try {
    const stats = await lstat2(filePath);
    if (!stats.isFile()) {
      return void 0;
    }
    if (stats.size > 1024 * 1024) {
      throw new Error(`${filePath} is too large to use as Node.js configuration.`);
    }
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return void 0;
    }
    throw error;
  }
}
async function fetchText(url) {
  const response = await fetch(url, { headers: { "User-Agent": "claude-triage-action" } });
  if (!response.ok) {
    throw new Error(`Could not fetch ${url}: HTTP ${response.status}.`);
  }
  return response.text();
}
async function resolveNodeRelease(requirement) {
  const indexValue = JSON.parse(await fetchText(NODE_RELEASE_INDEX_URL));
  if (!Array.isArray(indexValue) || !indexValue.every(isPublishedNodeRelease)) {
    throw new Error("Node.js returned an invalid release index.");
  }
  return selectMinimumPublishedNodeRelease(requirement.range, indexValue);
}
async function installNodeRelease(client, sandboxId, release) {
  const systemVersion = await client.exec(sandboxId, ["/usr/local/bin/node", "--version"]);
  if (systemVersion.exitCode === 0 && systemVersion.stdout.trim() === `v${release.version}`) {
    return "/usr/local/bin";
  }
  const installDirectory = `${TOOLCHAIN_ROOT}/v${release.version}`;
  const nodeBinPath = `${installDirectory}/bin`;
  assertNodeBinPath(nodeBinPath);
  const manifest = await fetchText(`${NODE_DOWNLOAD_ROOT}/v${release.version}/SHASUMS256.txt`);
  const expectedChecksum = findNodeArchiveChecksum(manifest, release.archiveName);
  const archivePath = `/workspace/.claude-triage/${release.archiveName}`;
  const downloadUrl = `${NODE_DOWNLOAD_ROOT}/v${release.version}/${release.archiveName}`;
  const commands = [
    { argv: ["mkdir", "-p", installDirectory] },
    {
      argv: [
        "curl",
        "--fail",
        "--silent",
        "--show-error",
        "--location",
        downloadUrl,
        "--output",
        archivePath
      ],
      timeoutMs: 3e5
    }
  ];
  for (const command of commands) {
    const result = await client.exec(sandboxId, command.argv, {
      cwd: "/workspace",
      timeoutMs: command.timeoutMs ?? 12e4
    });
    if (result.exitCode !== 0) {
      throw new Error(`Could not prepare Node.js ${release.version}: ${result.stderr}`);
    }
  }
  const checksumResult = await client.exec(sandboxId, ["sha256sum", archivePath], {
    cwd: "/workspace"
  });
  const actualChecksum = checksumResult.stdout.trim().split(/\s+/)[0];
  if (checksumResult.exitCode !== 0 || actualChecksum !== expectedChecksum) {
    await client.exec(sandboxId, ["rm", "-f", archivePath], { cwd: "/workspace" });
    throw new Error(`Checksum verification failed for Node.js ${release.version}.`);
  }
  const extractResult = await client.exec(
    sandboxId,
    [
      "tar",
      "--extract",
      "--file",
      archivePath,
      "--directory",
      installDirectory,
      "--strip-components=1"
    ],
    { cwd: "/workspace", timeoutMs: 3e5 }
  );
  await client.exec(sandboxId, ["rm", "-f", archivePath], { cwd: "/workspace" });
  if (extractResult.exitCode !== 0) {
    throw new Error(`Could not extract Node.js ${release.version}: ${extractResult.stderr}`);
  }
  const verifyResult = await client.exec(sandboxId, [`${nodeBinPath}/node`, "--version"]);
  if (verifyResult.exitCode !== 0 || verifyResult.stdout.trim() !== `v${release.version}`) {
    throw new Error(`Installed Node.js ${release.version} did not pass verification.`);
  }
  return nodeBinPath;
}
async function prepareNodeRuntime(client, sandboxId, repositoryDirectory, requestedVersion = "auto") {
  const sources = await Promise.all([
    readOptionalRegularFile(path2.join(repositoryDirectory, "package.json")),
    readOptionalRegularFile(path2.join(repositoryDirectory, ".node-version")),
    readOptionalRegularFile(path2.join(repositoryDirectory, ".nvmrc"))
  ]);
  const requirement = detectNodeRequirement(
    {
      ...sources[0] === void 0 ? {} : { packageJson: sources[0] },
      ...sources[1] === void 0 ? {} : { nodeVersionFile: sources[1] },
      ...sources[2] === void 0 ? {} : { nvmrc: sources[2] }
    },
    requestedVersion
  );
  const release = await resolveNodeRelease(requirement);
  const binPath = await installNodeRelease(client, sandboxId, release);
  return { ...release, binPath, requirement };
}

// src/sandbox-cli.ts
var HYDRATE_ATTEMPTS = 3;
var HYDRATE_ARCHIVE_PATH = "/workspace/.claude-triage-repository.tar.gz";
var HYDRATE_BOOTSTRAP_PATH = "/workspace/.claude-triage-bootstrap";
var HYDRATE_COMPLETE_PATH = "/workspace/.claude-triage-hydrated";
var HYDRATE_PART_PREFIX = "/workspace/.claude-triage-part-";
async function delay(milliseconds) {
  await new Promise((resolve2) => {
    setTimeout(resolve2, milliseconds);
  });
}
function requiredArgument(value, description) {
  if (!value) {
    throw new Error(`Missing ${description}.`);
  }
  return value;
}
function parseSnapshotExclusions(value) {
  return (value ?? "").split(/\r?\n/).map((pattern) => pattern.trim()).filter((pattern) => pattern.length > 0 && !pattern.startsWith("#"));
}
async function initializeRepository(client, sandboxId) {
  const commands = [
    ["git", "init", "-b", "claude-triage-base", "."],
    ["git", "config", "user.name", "Claude Triage"],
    ["git", "config", "user.email", "claude-triage@users.noreply.github.com"],
    ["git", "add", "--force", "."],
    ["git", "commit", "-m", "chore: sandbox baseline"]
  ];
  for (const argv of commands) {
    const result = await client.exec(sandboxId, argv, { timeoutMs: 3e5 });
    if (result.exitCode !== 0) {
      throw new Error(
        `Could not initialize sandbox repository with ${argv[0]}: ${result.stderr || result.stdout}`
      );
    }
  }
}
async function writeFileWithRetries(client, sandboxId, filePath, content, description) {
  for (let attempt = 1; attempt <= HYDRATE_ATTEMPTS; attempt += 1) {
    try {
      await client.writeFile(sandboxId, filePath, content);
      return;
    } catch (error) {
      if (attempt === HYDRATE_ATTEMPTS) {
        throw error;
      }
      process.stderr.write(
        `${description} attempt ${attempt}/${HYDRATE_ATTEMPTS} failed: ${error instanceof Error ? error.message : String(error)}; retrying this file.
`
      );
      await delay(1e3 * 2 ** (attempt - 1));
    }
  }
}
async function archiveWasExtracted(client, sandboxId, archiveSha256) {
  try {
    return (await client.readFile(sandboxId, HYDRATE_COMPLETE_PATH)).trim() === archiveSha256;
  } catch {
    return false;
  }
}
async function extractRepositoryArchive(client, sandboxId, archive) {
  const partPaths = Array.from(
    { length: archive.partCount },
    (_, index) => `${HYDRATE_PART_PREFIX}${String(index).padStart(6, "0")}`
  );
  const extractionScript = [
    "set -euo pipefail",
    `cat ${partPaths.map((partPath) => `'${partPath}'`).join(" ")} > '${HYDRATE_ARCHIVE_PATH}'`,
    `printf '%s  %s\\n' '${archive.sha256}' '${HYDRATE_ARCHIVE_PATH}' | sha256sum --check --status`,
    "mkdir -p '/workspace'",
    `tar --extract --gzip --file '${HYDRATE_ARCHIVE_PATH}' --directory '/workspace'`,
    `printf '%s\\n' '${archive.sha256}' > '${HYDRATE_COMPLETE_PATH}.tmp'`,
    `mv '${HYDRATE_COMPLETE_PATH}.tmp' '${HYDRATE_COMPLETE_PATH}'`
  ].join("\n");
  for (let attempt = 1; attempt <= HYDRATE_ATTEMPTS; attempt += 1) {
    if (await archiveWasExtracted(client, sandboxId, archive.sha256)) {
      return;
    }
    try {
      const extractResult = await client.exec(sandboxId, ["bash", "-lc", extractionScript], {
        cwd: "/workspace",
        timeoutMs: 3e5
      });
      if (extractResult.exitCode === 0) {
        return;
      }
      throw new Error(
        `Could not verify and extract the repository archive: ${extractResult.stderr || extractResult.stdout}`
      );
    } catch (error) {
      if (await archiveWasExtracted(client, sandboxId, archive.sha256)) {
        return;
      }
      if (attempt === HYDRATE_ATTEMPTS) {
        throw error;
      }
      process.stderr.write(
        `Archive extraction attempt ${attempt}/${HYDRATE_ATTEMPTS} failed: ${error instanceof Error ? error.message : String(error)}; retrying extraction with the uploaded parts.
`
      );
      await delay(1e3 * 2 ** (attempt - 1));
    }
  }
}
async function cleanupHydrationFiles(client, sandboxId) {
  try {
    const cleanupResult = await client.exec(
      sandboxId,
      [
        "bash",
        "-lc",
        `rm -f '${HYDRATE_PART_PREFIX}'* '${HYDRATE_ARCHIVE_PATH}' '${HYDRATE_BOOTSTRAP_PATH}' '${HYDRATE_COMPLETE_PATH}' '${HYDRATE_COMPLETE_PATH}.tmp'`
      ],
      { cwd: "/workspace", timeoutMs: 12e4 }
    );
    if (cleanupResult.exitCode !== 0) {
      throw new Error(cleanupResult.stderr || cleanupResult.stdout);
    }
  } catch (error) {
    process.stderr.write(
      `Warning: could not remove repository hydration files: ${error instanceof Error ? error.message : String(error)}.
`
    );
  }
}
async function hydrateRepositoryArchive(client, sandboxId, archive) {
  await writeFileWithRetries(
    client,
    sandboxId,
    HYDRATE_BOOTSTRAP_PATH,
    "ready",
    "Sandbox bootstrap upload"
  );
  let uploadedParts = 0;
  for await (const part of readArchiveParts(archive.path, archive.partBytes)) {
    const partName = String(part.index).padStart(6, "0");
    await writeFileWithRetries(
      client,
      sandboxId,
      `${HYDRATE_PART_PREFIX}${partName}`,
      part.bytes,
      `Archive part ${part.index + 1}/${archive.partCount} upload`
    );
    uploadedParts += 1;
    process.stderr.write(
      `Uploaded archive part ${uploadedParts}/${archive.partCount} (${part.bytes.byteLength} bytes).
`
    );
  }
  if (uploadedParts !== archive.partCount) {
    throw new Error(`Uploaded ${uploadedParts} archive parts; expected ${archive.partCount}.`);
  }
  await extractRepositoryArchive(client, sandboxId, archive);
  await cleanupHydrationFiles(client, sandboxId);
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const bridge = loadBridgeEnvironment();
  const client = new SandboxBridgeClient(bridge.apiUrl, bridge.apiKey);
  if (command === "create") {
    process.stdout.write(`${await client.create()}
`);
    return;
  }
  if (command === "destroy") {
    await client.destroy(requiredArgument(args[0], "sandbox ID"));
    return;
  }
  if (command === "hydrate-worktree") {
    const sandboxId = requiredArgument(args[0], "sandbox ID");
    const repositoryDirectory = path3.resolve(requiredArgument(args[1], "repository directory"));
    const snapshotExclusions = parseSnapshotExclusions(args[2]);
    const archive = await createRepositoryArchive(
      repositoryDirectory,
      void 0,
      snapshotExclusions
    );
    try {
      process.stderr.write(
        `Created ${archive.byteLength}-byte repository archive with ${archive.fileCount} tracked files in ${archive.partCount} parts.
`
      );
      if (snapshotExclusions.length > 0) {
        process.stderr.write(
          `Excluded snapshot paths matching: ${snapshotExclusions.map((pattern) => JSON.stringify(pattern)).join(", ")}.
`
        );
      }
      await hydrateRepositoryArchive(client, sandboxId, archive);
    } finally {
      await archive.dispose();
    }
    await initializeRepository(client, sandboxId);
    process.stderr.write(
      `Hydrated ${archive.fileCount} tracked files and created a baseline commit.
`
    );
    return;
  }
  if (command === "prepare-node") {
    const sandboxId = requiredArgument(args[0], "sandbox ID");
    const repositoryDirectory = path3.resolve(requiredArgument(args[1], "repository directory"));
    const requestedVersion = args[2] || "auto";
    const runtime = await prepareNodeRuntime(
      client,
      sandboxId,
      repositoryDirectory,
      requestedVersion
    );
    process.stderr.write(
      `Selected Node.js ${runtime.version} from ${runtime.requirement.source} (${runtime.requirement.range}).
`
    );
    process.stdout.write(`${JSON.stringify(runtime)}
`);
    return;
  }
  if (command === "export-patch") {
    const sandboxId = requiredArgument(args[0], "sandbox ID");
    const outputPath = path3.resolve(requiredArgument(args[1], "patch output path"));
    const stageResult = await client.exec(sandboxId, ["git", "add", "--all"], {
      timeoutMs: 12e4
    });
    if (stageResult.exitCode !== 0) {
      throw new Error(`Could not stage the sandbox patch: ${stageResult.stderr}`);
    }
    const result = await client.exec(
      sandboxId,
      ["git", "diff", "--cached", "--binary", "--no-ext-diff", "HEAD", "--"],
      { timeoutMs: 12e4, maxOutputChars: 16 * 1024 * 1024 }
    );
    if (result.exitCode !== 0 || result.stdoutTruncated) {
      throw new Error(
        `Could not export complete patch: ${result.stderr || "output was truncated"}`
      );
    }
    await writeFile(outputPath, result.stdout);
    return;
  }
  if (command === "upload-issue-context") {
    const sandboxId = requiredArgument(args[0], "sandbox ID");
    const inputPath = path3.resolve(requiredArgument(args[1], "issue context path"));
    await client.writeFile(sandboxId, "/workspace/issue.json", await readFile2(inputPath, "utf8"));
    return;
  }
  if (command === "upload-triage-context") {
    const sandboxId = requiredArgument(args[0], "sandbox ID");
    const artifactDirectory = path3.resolve(requiredArgument(args[1], "triage artifact directory"));
    const files = [
      ["issue-context.json", "/workspace/issue.json"],
      ["triage-result.json", "/workspace/triage.json"],
      ["triage-manifest.json", "/workspace/triage-manifest.json"]
    ];
    for (const [sourceName, destinationPath] of files) {
      await client.writeFile(
        sandboxId,
        destinationPath,
        await readFile2(path3.join(artifactDirectory, sourceName), "utf8")
      );
    }
    return;
  }
  if (command === "mcp-config") {
    const serverPath = path3.resolve(requiredArgument(args[0], "MCP server path"));
    const nodeBinPath = args[1];
    process.stdout.write(
      `${JSON.stringify({
        mcpServers: {
          sandbox: {
            type: "stdio",
            command: "node",
            args: [serverPath],
            ...nodeBinPath ? { env: { SANDBOX_NODE_BIN: nodeBinPath } } : {}
          }
        }
      })}
`
    );
    return;
  }
  throw new Error(
    "Usage: sandbox-cli <create|destroy|hydrate-worktree|prepare-node|upload-issue-context|upload-triage-context|export-patch|mcp-config> [...args]"
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
export {
  hydrateRepositoryArchive
};
//# sourceMappingURL=sandbox-cli.mjs.map
