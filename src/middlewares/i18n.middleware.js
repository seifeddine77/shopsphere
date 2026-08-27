const path = require('path');
const fs = require('fs');

const SUPPORTED_LANGS = {
  en: { code: 'en', name: 'English', flag: '🇬🇧', dir: 'ltr' },
  fr: { code: 'fr', name: 'Français', flag: '🇫🇷', dir: 'ltr' },
  ar: { code: 'ar', name: 'العربية', flag: '🇸🇦', dir: 'rtl' },
};

const dictionaries = {};
['en', 'fr', 'ar'].forEach((lang) => {
  try {
    const filePath = path.join(__dirname, '..', 'locales', lang + '.json');
    if (fs.existsSync(filePath)) {
      dictionaries[lang] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (_err) {
    dictionaries[lang] = {};
  }
});

function getNestedTranslation(obj, keyPath) {
  if (!obj) return null;
  const parts = keyPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return null;
    }
  }
  return typeof current === 'string' ? current : null;
}

function translate(lang, key, fallbackOrParams = null, maybeParams = {}) {
  let fallback = null;
  let params = {};

  if (fallbackOrParams && typeof fallbackOrParams === 'object') {
    params = fallbackOrParams;
  } else if (typeof fallbackOrParams === 'string') {
    fallback = fallbackOrParams;
    params = maybeParams || {};
  }

  const targetDict = dictionaries[lang] || dictionaries.en;
  let text = getNestedTranslation(targetDict, key);
  if (text === null && lang !== 'en') {
    text = getNestedTranslation(dictionaries.en, key);
  }
  if (text === null) {
    text = fallback !== null ? fallback : key;
  }
  if (text && params && typeof params === 'object') {
    Object.keys(params).forEach((paramKey) => {
      text = text.replace(new RegExp('\\{' + paramKey + '\\}', 'g'), params[paramKey]);
    });
  }
  return text;
}

function i18nMiddleware(req, res, next) {
  let lang = 'en';
  if (req.query.lang && SUPPORTED_LANGS[req.query.lang.toLowerCase()]) {
    lang = req.query.lang.toLowerCase();
    res.cookie('lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false, sameSite: 'lax' });
  } else if (req.cookies && req.cookies.lang && SUPPORTED_LANGS[req.cookies.lang.toLowerCase()]) {
    lang = req.cookies.lang.toLowerCase();
  }

  const currentLangMeta = SUPPORTED_LANGS[lang] || SUPPORTED_LANGS.en;

  req.lang = lang;
  req.dir = currentLangMeta.dir;
  req.t = (key, fallbackOrParams, maybeParams) => translate(lang, key, fallbackOrParams, maybeParams);

  res.locals.currentLang = lang;
  res.locals.dir = currentLangMeta.dir;
  res.locals.supportedLangs = Object.values(SUPPORTED_LANGS);
  res.locals.currentLangMeta = currentLangMeta;
  res.locals.t = (key, fallbackOrParams, maybeParams) => translate(lang, key, fallbackOrParams, maybeParams);

  next();
}

module.exports = { i18nMiddleware, SUPPORTED_LANGS, translate };
