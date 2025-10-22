(function (global) {
  const smartJSON = {};

  //  Basit JSON doğrulama
  smartJSON.isValid = (text) => {
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  };

  //  Güvenli parse: parse edilemezse otomatik düzeltmeyi dener
  smartJSON.parseSafe = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      const fixed = smartJSON.fixJSON(text);
      try {
        return JSON.parse(fixed);
      } catch {
        return null; // hâlâ düzelmiyorsa null döndür
      }
    }
  };

  //  JSON otomatik düzeltici (Regex tabanlı)
  smartJSON.fixJSON = (text) => {
    let result = text;

    // 1. property adlarını tırnak içine al: {name: "Egehan"} → {"name": "Egehan"}
    result = result.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":');

    // 2. Fazla virgülleri kaldır: {"a":1,} → {"a":1}
    result = result.replace(/,(\s*[}\]])/g, '$1');

    // 3. Tek tırnakları düzelt: {'a': 'b'} → {"a": "b"}
    result = result.replace(/'/g, '"');

    // 4. Boşluk ve gereksiz satırları temizle
    result = result.trim();

    return result;
  };

  //  JSON sıkıştır (minify)
  smartJSON.minify = (text) => {
    return JSON.stringify(JSON.parse(text));
  };

  //  JSON güzelleştir (pretty print)
  smartJSON.pretty = (text, spaces = 2) => {
    return JSON.stringify(JSON.parse(text), null, spaces);
  };

  //  Bozuk JSON tespiti (AI/LLM çıktılarına özel)
  smartJSON.detectBroken = (text) => {
    const redFlags = ["```", "json", "undefined", "None", "NaN"];
    return redFlags.some(flag => text.includes(flag));
  };

  //  Basit JSON Schema doğrulama
smartJSON.validateSchema = (schema, data) => {
  const errors = [];

  // 1. Eksik alanları kontrol et
  for (const key of Object.keys(schema)) {
    if (!(key in data)) {
      errors.push(`'${key}' is missing`);
      continue;
    }

    // 2. Tip kontrolü
    const expectedType = schema[key];
    const actualType = Array.isArray(data[key]) ? "array" : typeof data[key];

    if (expectedType !== actualType) {
      errors.push(`'${key}' should be ${expectedType}, got ${actualType}`);
    }
  }

  // 3. Fazla alanları da bildir (isteğe bağlı)
  for (const key of Object.keys(data)) {
    if (!(key in schema)) {
      errors.push(`'${key}' is not defined in schema`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};


smartJSON.autofix = (rawText) => {
  let text = rawText;

  // 1️ Kod bloklarını temizle (```json ... ```)
  text = text.replace(/```json([\s\S]*?)```/gi, '$1');
  text = text.replace(/```([\s\S]*?)```/gi, '$1');

  // 2️ "Here is the data:" gibi açıklamaları temizle
  text = text.replace(/^[^\{]*\{/s, '{'); // ilk {’ten öncesini at
  text = text.replace(/\}[^}]*$/s, '}');  // son }’den sonrasını at

  // 3️ Python tarzı None/True/False -> JS'e çevir
  text = text.replace(/\bNone\b/g, 'null');
  text = text.replace(/\bTrue\b/g, 'true');
  text = text.replace(/\bFalse\b/g, 'false');

  // 4️ JSON’u düzelt
  const fixed = smartJSON.fixJSON(text);

  // 5️ Parse etmeyi dene
  try {
    return JSON.parse(fixed);
  } catch {
    return null; // hala bozuksa null dön
  }
};


//  Döngüsel referansları güvenli şekilde string'e çevir
smartJSON.stringifySafe = (obj, space = 2) => {
  const seen = new WeakSet(); // referansları hatırlamak için

  return JSON.stringify(
    obj,
    (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular ~]"; // döngüyü yakaladık!
        }
        seen.add(value);
      }
      return value;
    },
    space
  );
};


//  JSON nesnesini analiz eder (derinlik, tip sayımı, vs.)
smartJSON.inspect = (obj) => {
  const stats = {
    keys: 0,
    types: {},
    depth: 0,
    size: 0,
    preview: ""
  };

  // 🔹 Derinlik hesaplama (recursive)
  const getDepth = (value, currentDepth = 0) => {
    if (typeof value !== "object" || value === null) return currentDepth;
    let max = currentDepth;
    for (const key in value) {
      max = Math.max(max, getDepth(value[key], currentDepth + 1));
    }
    return max;
  };

  // 🔹 Tür istatistikleri
  const countTypes = (value) => {
    if (Array.isArray(value)) {
      stats.types["array"] = (stats.types["array"] || 0) + 1;
      value.forEach((v) => countTypes(v));
    } else if (typeof value === "object" && value !== null) {
      stats.types["object"] = (stats.types["object"] || 0) + 1;
      for (const key in value) {
        stats.keys++;
        countTypes(value[key]);
      }
    } else {
      const t = typeof value;
      stats.types[t] = (stats.types[t] || 0) + 1;
    }
  };

  countTypes(obj);
  stats.depth = getDepth(obj);
  stats.size = smartJSON.stringifySafe(obj).length;
  stats.preview = smartJSON.stringifySafe(obj, 0);

  return stats;
};


// İki JSON nesnesini karşılaştırır (diff engine)
smartJSON.compare = (obj1, obj2) => {
  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];

  const allKeys = new Set([
    ...Object.keys(obj1 || {}),
    ...Object.keys(obj2 || {})
  ]);

  for (const key of allKeys) {
    const val1 = obj1 ? obj1[key] : undefined;
    const val2 = obj2 ? obj2[key] : undefined;

    if (!(key in obj1)) {
      added.push(key);
    } else if (!(key in obj2)) {
      removed.push(key);
    } else if (JSON.stringify(val1) !== JSON.stringify(val2)) {
      changed.push(key);
    } else {
      unchanged.push(key);
    }
  }

  return { added, removed, changed, unchanged };
};


//  İki JSON arasındaki farklara göre birincisini günceller
smartJSON.patch = (obj1, obj2) => {
  if (!obj1 || typeof obj1 !== "object") return smartJSON.deepClone(obj2);
  if (!obj2 || typeof obj2 !== "object") return obj1;

  const result = smartJSON.deepClone(obj1);

  // 1️ Yeni veya değişen alanları güncelle
  for (const key in obj2) {
    const val1 = obj1[key];
    const val2 = obj2[key];

    // Derin karşılaştırma
    if (typeof val2 === "object" && val2 !== null && !Array.isArray(val2)) {
      result[key] = smartJSON.patch(val1 || {}, val2);
    } else {
      result[key] = val2;
    }
  }

  // 2 Obj2’de olmayan alanları sil
  for (const key in obj1) {
    if (!(key in obj2)) {
      delete result[key];
    }
  }

  return result;
};

//  JSON farklarını insan dilinde özetler
smartJSON.changelog = (obj1, obj2) => {
  const diff = smartJSON.compare(obj1, obj2);
  const lines = [];

  // 🟢 Eklenen alanlar
  for (const key of diff.added) {
    lines.push(`🟢 "${key}" alanı eklendi.`);
  }

  // 🔴 Silinen alanlar
  for (const key of diff.removed) {
    lines.push(`🔴 "${key}" alanı kaldırıldı.`);
  }

  // 🟡 Değişen alanlar (eski ve yeni değerleri göster)
  for (const key of diff.changed) {
    const oldVal = JSON.stringify(obj1[key]);
    const newVal = JSON.stringify(obj2[key]);
    lines.push(`🟡 "${key}" alanı ${oldVal} → ${newVal} olarak değişti.`);
  }

  // ⚪ Aynı kalanlar
  if (diff.unchanged.length) {
    lines.push(`⚪ Değişmeyen alanlar: ${diff.unchanged.join(", ")}.`);
  }

  // Boşsa
  if (lines.length === 0) {
    return " Hiçbir değişiklik yok.";
  }

  return lines.join("\n");
};

//  İki JSON arasındaki farkları HTML olarak üretir
smartJSON.diffHTML = (obj1, obj2) => {
  const diff = smartJSON.compare(obj1, obj2);
  const htmlLines = [];

  // HTML helper
  const esc = (str) =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  // 🟢 Eklenen alanlar
  for (const key of diff.added) {
    const val = JSON.stringify(obj2[key]);
    htmlLines.push(
      `<div class="json-added">🟢 <b>${esc(key)}</b> eklendi → <span class="value">${esc(val)}</span></div>`
    );
  }

  // 🔴 Silinen alanlar
  for (const key of diff.removed) {
    const val = JSON.stringify(obj1[key]);
    htmlLines.push(
      `<div class="json-removed">🔴 <b>${esc(key)}</b> kaldırıldı (eski değer: <span class="value">${esc(val)}</span>)</div>`
    );
  }

  // 🟡 Değişen alanlar
  for (const key of diff.changed) {
    const oldVal = JSON.stringify(obj1[key]);
    const newVal = JSON.stringify(obj2[key]);
    htmlLines.push(
      `<div class="json-changed">🟡 <b>${esc(key)}</b> değişti: <span class="old">${esc(oldVal)}</span> → <span class="new">${esc(newVal)}</span></div>`
    );
  }

  // ⚪ Değişmeyen alanlar (isteğe bağlı)
  if (diff.unchanged.length) {
    htmlLines.push(
      `<div class="json-unchanged">⚪ Değişmeyen alanlar: ${esc(diff.unchanged.join(", "))}</div>`
    );
  }

  // Hiç fark yoksa
  if (htmlLines.length === 0) {
    htmlLines.push(`<div class="json-same">✅ Hiçbir fark yok.</div>`);
  }

  // Sonuç
  return `<div class="smartjson-diff">${htmlLines.join("\n")}</div>`;
};


//  Derin, akıllı JSON birleştirme fonksiyonu
smartJSON.merge = (...objects) => {
  const isObject = (obj) =>
    obj && typeof obj === "object" && !Array.isArray(obj);

  const mergeTwo = (target, source) => {
    for (const key in source) {
      const val = source[key];
      const prev = target[key];

      // 🔹 Her iki taraf da obje ise derinlemesine birleştir
      if (isObject(prev) && isObject(val)) {
        target[key] = mergeTwo({ ...prev }, val);

      // 🔹 Her iki taraf da dizi ise birleştir (unique elemanlarla)
      } else if (Array.isArray(prev) && Array.isArray(val)) {
        target[key] = Array.from(new Set([...prev, ...val]));

      // 🔹 Aksi halde yeni değeri yaz
      } else {
        target[key] = val;
      }
    }
    return target;
  };

  // Başlangıç objesini kopyala, sırayla diğerlerini birleştir
  return objects.reduce((acc, obj) => mergeTwo(acc, obj), {});
};


//  JSON içinde derin arama yapar (anahtar veya değer bazlı)
smartJSON.search = (json, query, options = {}) => {
  const results = [];
  const { matchValue = true, matchKey = true, caseSensitive = false } = options;

  const normalize = (x) =>
    caseSensitive ? String(x) : String(x).toLowerCase();
  const normalizedQuery = normalize(query);

  const recurse = (obj, path = "") => {
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => recurse(item, `${path}[${i}]`));
    } else if (typeof obj === "object" && obj !== null) {
      for (const key in obj) {
        const val = obj[key];
        const currentPath = path ? `${path}.${key}` : key;

        // Anahtar eşleşmesi
        if (matchKey && normalize(key).includes(normalizedQuery)) {
          results.push({ path: currentPath, value: val });
        }

        // Değer eşleşmesi
        if (
          matchValue &&
          (typeof val === "string" || typeof val === "number" || typeof val === "boolean") &&
          normalize(val).includes(normalizedQuery)
        ) {
          results.push({ path: currentPath, value: val });
        }

        // Derine in
        if (typeof val === "object" && val !== null) recurse(val, currentPath);
      }
    }
  };

  recurse(json);
  return results;
};

//  Büyük JSON verilerini parça parça işleyen parser
smartJSON.streamParse = async (input, onChunk, options = {}) => {
  const { chunkSize = 1024 * 10 } = options; // 10KB varsayılan parça boyutu
  let buffer = "";

  // 🔹 Girdi: string mi stream mi?
  const isStream =
    typeof input === "object" &&
    input !== null &&
    typeof input.read === "function";

  // 🔸 1. Eğer stream ise, sırayla chunk oku
  if (isStream) {
    for await (const chunk of input) {
      buffer += chunk.toString();

      // JSON objeleri parça parça ayrıştırılacak
      const matches = buffer.match(/{[^{}]+}/g);
      if (matches) {
        for (const jsonText of matches) {
          try {
            const obj = JSON.parse(jsonText);
            onChunk(obj);
          } catch {
            /* parça tamamlanmamış olabilir, bekle */
          }
        }
      }

      // tamponu sınırlı tut
      if (buffer.length > chunkSize * 5) buffer = buffer.slice(-chunkSize);
    }
  } else {
    // 🔸 2. Normal string input ise, yapay stream gibi böl
    for (let i = 0; i < input.length; i += chunkSize) {
      const piece = input.slice(i, i + chunkSize);
      buffer += piece;

      const matches = buffer.match(/{[^{}]+}/g);
      if (matches) {
        for (const jsonText of matches) {
          try {
            const obj = JSON.parse(jsonText);
            onChunk(obj);
          } catch {
            /* parçalanmamış JSON — sonraki döngüde tamamlanacak */
          }
        }
      }

      if (buffer.length > chunkSize * 5) buffer = buffer.slice(-chunkSize);
      await new Promise((r) => setTimeout(r, 0)); // async taklit
    }
  }

  return true;
};

//  AI veya metin çıktılarından JSON verisini otomatik çıkarır
smartJSON.autoExtract = (rawText, options = {}) => {
  const {
    tryFix = true,      // Bozuk JSON varsa düzelt
    multi = false,      // Birden fazla JSON döndür
    returnString = false // JSON string olarak döndür
  } = options;

  if (typeof rawText !== "string") return null;

  // 1️ Kod bloklarını ve markdown formatını temizle
  let content = rawText
    .replace(/```json([\s\S]*?)```/gi, "$1")
    .replace(/```([\s\S]*?)```/gi, "$1")
    .replace(/\\n/g, "\n") // escaped newline'ları düzelt
    .trim();

  // 2️ Metin içindeki tüm olası JSON bloklarını yakala
  const matches = content.match(/\{[\s\S]*?\}/g);
  if (!matches) return null;

  // 3️ Her bir eşleşmeyi işle
  const parsed = matches.map((match) => {
    let jsonText = match
      .replace(/^[^{]+/, "") // baştaki fazlalıkları at
      .replace(/[^}]+$/, "") // sondaki fazlalıkları at
      .replace(/\/\/.*$/gm, "") // tek satır yorum
      .replace(/\/\*[\s\S]*?\*\//g, ""); // block yorum

    if (tryFix && smartJSON.fixJSON) {
      jsonText = smartJSON.fixJSON(jsonText);
    }

    try {
      const obj = JSON.parse(jsonText);
      return returnString ? JSON.stringify(obj, null, 2) : obj;
    } catch {
      return null;
    }
  }).filter(Boolean);

  // 4️ multi = false ise sadece ilkini döndür
  if (!multi) return parsed[0] || null;
  return parsed.length ? parsed : null;
};




  global.smartJSON = smartJSON;
})(typeof window !== "undefined" ? window : globalThis);

