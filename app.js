const els = {
  imageInput: document.getElementById("imageInput"),
  brandSelect: document.getElementById("brandSelect"),
  authorNameInput: document.getElementById("authorNameInput"),
  modelInput: document.getElementById("modelInput"),
  paramsInput: document.getElementById("paramsInput"),
  timeInput: document.getElementById("timeInput"),
  locationInput: document.getElementById("locationInput"),
  showTime: document.getElementById("showTime"),
  showLocation: document.getElementById("showLocation"),
  renderBtn: document.getElementById("renderBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  canvas: document.getElementById("previewCanvas"),
  statusText: document.getElementById("statusText"),
};

const state = {
  brands: [],
  selectedFile: null,
  sourceDataUrl: "",
  sourceMime: "",
  sourceExifObj: null,
  parsedExif: null,
  outputDataUrl: "",
  outputExt: "jpg",
  brandStats: { total: 0, active: 0 },
  logoCache: new Map(),
  fontLoadResult: new Map(),
  loadedFontFamilies: new Set(),
  renderTimer: null,
};

const FONT_WEIGHTS = ["Regular", "Medium", "SemiBold"];

const PHONE_HINTS = [
  "iphone", "pixel", "sm-", "galaxy", "huawei", "redmi", "xiaomi", "mi ", "oppo", "vivo", "oneplus", "honor", "realme",
];

init();

async function init() {
  state.brands = await loadBrands();
  await ensureBrandFontsLoaded({
    id: "google",
    folder: "Google",
    fontPrefix: "Google",
  });
  renderBrandSelect();
  bindEvents();
}

function bindEvents() {
  els.imageInput.addEventListener("change", onPickImage);
  els.renderBtn.addEventListener("click", () => {
    renderFrame();
  });
  els.downloadBtn.addEventListener("click", downloadImage);

  const realtimeTargets = [
    els.brandSelect,
    els.authorNameInput,
    els.modelInput,
    els.paramsInput,
    els.timeInput,
    els.locationInput,
    els.showTime,
    els.showLocation,
  ];

  for (const target of realtimeTargets) {
    if (!target) {
      continue;
    }
    target.addEventListener("input", onRealtimeInput);
    target.addEventListener("change", onRealtimeInput);
  }

  const themeRadios = document.querySelectorAll("input[name='theme']");
  for (const radio of themeRadios) {
    radio.addEventListener("change", scheduleRender);
  }
}

function onRealtimeInput(event) {
  if (event.target === els.authorNameInput) {
    maybeRefreshFallbackParams();
  }
  scheduleRender();
}

function scheduleRender() {
  if (!state.selectedFile || !state.sourceDataUrl) {
    return;
  }
  if (state.renderTimer) {
    clearTimeout(state.renderTimer);
  }
  state.renderTimer = setTimeout(() => {
    renderFrame();
  }, 120);
}

async function loadBrands() {
  let parsed = [];

  try {
    const resp = await fetch("./brands.json", { cache: "no-store" });
    if (resp.ok) {
      const json = await resp.json();
      if (Array.isArray(json)) {
        parsed = json;
      }
    }
  } catch (err) {
    parsed = [];
  }

  const normalized = parsed.map(normalizeBrand).filter(Boolean);
  const enabled = [];

  for (const brand of normalized) {
    const resolvedLogo = await resolveBrandLogo(brand);
    if (!resolvedLogo) {
      continue;
    }
    brand.logo = resolvedLogo;
    enabled.push(brand);
  }

  state.brandStats = { total: normalized.length, active: enabled.length };

  if (enabled.length > 0) {
    updateStatus(`品牌已启用 ${enabled.length}/${Math.max(normalized.length, 1)}（仅展示有可用 logo 的品牌）。`, false);
    return enabled;
  }

  const fallback = normalizeBrand({
    id: "google",
    name: "谷歌",
    folder: "Google",
    fontPrefix: "Google",
    logoCandidates: ["./assests/Google/Logo.svg", "./assests/Google/Google.svg", "./assests/Google.svg"],
    keywords: ["google", "pixel", "谷歌"],
    logoWidth: 76,
  });

  const fallbackLogo = await resolveBrandLogo(fallback);
  if (fallbackLogo) {
    fallback.logo = fallbackLogo;
    state.brandStats = { total: Math.max(normalized.length, 1), active: 1 };
    updateStatus("未找到可用品牌配置，已回退到默认 Google。", true);
    return [fallback];
  }

  updateStatus("未找到可用 logo，请将品牌 logo 放入 assests 后刷新。", true);
  return [];
}

function normalizeBrand(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const rawId = String(item.id || item.name || "").trim();
  if (!rawId) {
    return null;
  }

  const folder = String(item.folder || toTitleCase(rawId)).trim() || toTitleCase(rawId);
  const fontPrefix = String(item.fontPrefix || folder).trim() || folder;

  return {
    id: rawId.toLowerCase(),
    name: String(item.name || rawId),
    folder,
    fontPrefix,
    logo: String(item.logo || `./assests/${folder}/Logo.svg`).trim(),
    logoCandidates: Array.isArray(item.logoCandidates) ? item.logoCandidates.map((x) => String(x || "").trim()).filter(Boolean) : [],
    keywords: Array.isArray(item.keywords) ? item.keywords.map((x) => String(x || "").trim()).filter(Boolean) : [],
    logoWidth: Number(item.logoWidth) || 76,
  };
}

async function resolveBrandLogo(brand) {
  const candidates = collectLogoCandidates(brand);
  for (const src of candidates) {
    const img = await getLogoImage(src);
    if (img) {
      return src;
    }
  }
  return "";
}

function collectLogoCandidates(brand) {
  const id = String(brand.id || "").trim();
  const name = String(brand.name || "").trim();
  const folder = String(brand.folder || "").trim();
  const tokens = [id, name, toTitleCase(id), toTitleCase(name), id.toUpperCase(), name.toUpperCase()].filter(Boolean);
  const autoPaths = [];

  if (folder) {
    autoPaths.push(`./assests/${folder}/Logo.svg`);
    autoPaths.push(`./assests/${folder}/${folder}.svg`);
  }

  for (const token of tokens) {
    autoPaths.push(`./assests/${token}.svg`);
    autoPaths.push(`./assests/logos/${token}.svg`);
    autoPaths.push(`./assests/${token}/${token}.svg`);
    autoPaths.push(`./assests/${token}/Logo.svg`);
  }

  return [...new Set([brand.logo, ...brand.logoCandidates, ...autoPaths].filter(Boolean))];
}

function toTitleCase(value) {
  if (!value) {
    return "";
  }
  return String(value)
    .split(/[\s_-]+/)
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}` : "")
    .join("");
}

function renderBrandSelect() {
  els.brandSelect.innerHTML = "";

  if (!state.brands.length) {
    const option = document.createElement("option");
    option.textContent = "无可用品牌";
    option.value = "";
    els.brandSelect.appendChild(option);
    els.brandSelect.disabled = true;
    return;
  }

  els.brandSelect.disabled = false;
  for (const brand of state.brands) {
    const option = document.createElement("option");
    option.value = brand.id;
    option.textContent = brand.name;
    els.brandSelect.appendChild(option);
  }
}

async function onPickImage(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }

  try {
    state.selectedFile = file;
    state.sourceMime = normalizeSourceMime(file.type, file.name);
    state.sourceDataUrl = await fileToDataURL(file);
    state.sourceExifObj = isJpegMime(state.sourceMime) ? extractExifForReuse(state.sourceDataUrl) : null;

    await readExifAndFillFields(file);
    await renderFrame();
  } catch (err) {
    updateStatus("图片读取失败，请更换文件重试。", true);
  }
}

function normalizeSourceMime(fileType, fileName) {
  const lowerType = String(fileType || "").toLowerCase();
  if (lowerType === "image/jpeg" || lowerType === "image/jpg") {
    return "image/jpeg";
  }
  if (lowerType === "image/png") {
    return "image/png";
  }
  if (lowerType === "image/webp") {
    return "image/webp";
  }

  const lowerName = String(fileName || "").toLowerCase();
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lowerName.endsWith(".png")) {
    return "image/png";
  }
  if (lowerName.endsWith(".webp")) {
    return "image/webp";
  }
  return "image/jpeg";
}

function isJpegMime(mime) {
  return String(mime || "").toLowerCase() === "image/jpeg";
}

async function readExifAndFillFields(file) {
  let exif = null;

  if (window.exifr) {
    try {
      exif = await window.exifr.parse(file, {
        ifd0: true,
        exif: true,
        gps: true,
        tiff: true,
      });
    } catch (err) {
      exif = null;
    }
  }

  state.parsedExif = exif;

  if (!exif || Object.keys(exif).length === 0) {
    const fallbackModel = getModelFromUA();
    els.modelInput.value = fallbackModel;
    els.paramsInput.value = fallbackShotText();
    els.timeInput.value = formatNow();
    els.locationInput.value = "";
    matchBrandByText(fallbackModel);
    updateStatus("未检测到 EXIF，已回退到本机 UA 与系统时间。", true);
    return;
  }

  const model = exif.Model || exif.model || getModelFromUA();
  const make = exif.Make || exif.make || "";
  const dateTime = exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate || "";
  const lat = exif.latitude;
  const lon = exif.longitude;

  els.modelInput.value = model;
  els.paramsInput.value = buildParamsText(exif, model, make);
  els.timeInput.value = formatExifTime(dateTime) || formatNow();
  els.locationInput.value = Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(6)}, ${lon.toFixed(6)}` : "";

  matchBrandByText(`${make} ${model}`);
  updateStatus("EXIF 已读取，可继续手动编辑参数。", false);
}

function buildParamsText(exif, model, make) {
  const fNumber = exif.FNumber || exif.ApertureValue;
  const exposure = exif.ExposureTime;
  const iso = exif.ISO || exif.ISOSpeedRatings;
  const focal = getFocalText(exif, model, make);

  const parts = [];
  if (Number.isFinite(fNumber)) {
    parts.push(`f/${toOneDecimal(fNumber)}`);
  }

  const expText = formatExposure(exposure);
  if (expText) {
    parts.push(expText);
  }

  if (Number.isFinite(iso)) {
    parts.push(`ISO${Math.round(iso)}`);
  }

  if (focal) {
    parts.push(focal);
  }

  return parts.length > 0 ? parts.join(" ") : fallbackShotText();
}

function getFocalText(exif, model, make) {
  const f35 = exif.FocalLengthIn35mmFormat;
  const focal = exif.FocalLength;
  const phone = isPhoneDevice(model, make);

  if (phone && Number.isFinite(f35)) {
    return `${Math.round(f35)}mm`;
  }
  if (Number.isFinite(focal)) {
    return `${Math.round(focal)}mm`;
  }
  if (Number.isFinite(f35)) {
    return `${Math.round(f35)}mm`;
  }
  return "";
}

function isPhoneDevice(model, make) {
  const merged = `${String(model || "").toLowerCase()} ${String(make || "").toLowerCase()}`;
  return PHONE_HINTS.some((key) => merged.includes(key));
}

function formatExposure(exposure) {
  if (!Number.isFinite(exposure) || exposure <= 0) {
    return "";
  }
  if (exposure >= 1) {
    return `${trimNum(exposure)}s`;
  }
  const denominator = Math.round(1 / exposure);
  return denominator > 0 ? `1/${denominator}s` : "";
}

function fallbackShotText() {
  const by = (els.authorNameInput.value || "Name").trim() || "Name";
  return `Shot by ${by}`;
}

function maybeRefreshFallbackParams() {
  const value = (els.paramsInput.value || "").trim().toLowerCase();
  if (!value || value.startsWith("shot by ")) {
    els.paramsInput.value = fallbackShotText();
  }
}

function getModelFromUA() {
  const ua = navigator.userAgent || "Browser Device";
  if (/iPhone/i.test(ua)) {
    return "iPhone";
  }
  if (/iPad/i.test(ua)) {
    return "iPad";
  }
  if (/Pixel/i.test(ua)) {
    return "Google Pixel";
  }
  if (/Android/i.test(ua)) {
    return "Android Device";
  }
  if (/Windows/i.test(ua)) {
    return "Windows Device";
  }
  if (/Macintosh/i.test(ua)) {
    return "Mac Device";
  }
  return "Browser Device";
}

function matchBrandByText(text) {
  if (!state.brands.length) {
    return;
  }

  const lower = String(text || "").toLowerCase();
  const found = state.brands.find((brand) => {
    const keys = [brand.id, brand.name, ...brand.keywords].filter(Boolean).map((x) => String(x).toLowerCase());
    return keys.some((key) => lower.includes(key));
  });

  if (found) {
    els.brandSelect.value = found.id;
  }
}

async function renderFrame() {
  if (!state.selectedFile || !state.sourceDataUrl) {
    updateStatus("请先选择图片。", true);
    return;
  }

  try {
    const ctx = els.canvas.getContext("2d");
    const img = await loadImage(state.sourceDataUrl);

    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const frameHeight = clamp(Math.round(width * 0.18), 140, 260);

    els.canvas.width = width;
    els.canvas.height = height + frameHeight;

    const theme = getTheme();
    const colors = getThemeColors(theme);
    const infoState = getInfoState();

    await ensureFontFallbackForBrand(infoState.selectedBrand);

    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    ctx.drawImage(img, 0, 0, width, height);

    ctx.fillStyle = colors.background;
    ctx.fillRect(0, height, width, frameHeight);

    await drawTopLine(ctx, {
      width,
      height,
      frameHeight,
      colors,
      infoState,
    });

    drawBottomLine(ctx, {
      width,
      height,
      frameHeight,
      colors,
      infoState,
    });

    const output = buildOutputDataUrl();
    state.outputDataUrl = output.dataUrl;
    state.outputExt = output.ext;

    els.downloadBtn.disabled = false;
    updateStatus(`预览已更新，导出分辨率 ${width}x${height + frameHeight}。`, false);
  } catch (err) {
    updateStatus("渲染失败，请更换图片后重试。", true);
  }
}

function buildOutputDataUrl() {
  if (isJpegMime(state.sourceMime)) {
    const baseJpeg = els.canvas.toDataURL("image/jpeg", 1.0);
    return {
      dataUrl: tryInsertExif(baseJpeg, state.sourceExifObj),
      ext: "jpg",
    };
  }

  return {
    dataUrl: els.canvas.toDataURL("image/png"),
    ext: "png",
  };
}

function getInfoState() {
  const model = (els.modelInput.value || "").trim() || getModelFromUA();
  const params = (els.paramsInput.value || "").trim() || fallbackShotText();
  const timeText = (els.timeInput.value || "").trim() || formatNow();
  const locationText = normalizeLatLngText((els.locationInput.value || "").trim());

  const showTime = els.showTime.checked;
  const showLocation = els.showLocation.checked;
  const selectedCount = Number(showTime) + Number(showLocation);

  const bottomParts = [];
  if (showTime) {
    bottomParts.push(timeText);
  }
  if (showLocation) {
    bottomParts.push(locationText || "0.000000, 0.000000");
  }

  return {
    model,
    params,
    selectedBrand: state.brands.find((item) => item.id === els.brandSelect.value) || state.brands[0],
    selectedCount,
    bottomText: bottomParts.join("  |  "),
  };
}

async function drawTopLine(ctx, payload) {
  const { width, height, infoState } = payload;
  const modelRaw = infoState.model;
  const paramsRaw = infoState.params;

  let modelSize = clamp(width * 0.03, 18, 40);
  let paramsSize = clamp(width * 0.018, 14, 28);

  const baseY = height + payload.frameHeight * 0.42;
  let modelY = baseY;
  let paramsY = baseY;

  if (infoState.selectedCount === 1) {
    paramsY -= 8;
  }
  if (infoState.selectedCount >= 2) {
    modelY -= 8;
  }

  const logoObj = infoState.selectedBrand || null;
  const hasLogo = Boolean(logoObj && logoObj.logo);
  const logoW = hasLogo ? clamp(Number(logoObj.logoWidth || 76), 40, 120) : 0;
  const logoH = hasLogo ? logoW * 0.45 : 0;

  let modelMaxW = width * 0.34;
  let paramsMaxW = width * 0.36;
  const modelFontFamily = getCanvasFontFamily(infoState.selectedBrand, "SemiBold");
  const paramsFontFamily = getCanvasFontFamily(infoState.selectedBrand, "Medium");

  ctx.font = `${modelSize}px ${modelFontFamily}`;
  const modelText = fitText(ctx, modelRaw, modelMaxW);
  const modelW = ctx.measureText(modelText).width;

  ctx.font = `${paramsSize}px ${paramsFontFamily}`;
  const paramsText = fitText(ctx, paramsRaw, paramsMaxW);
  const paramsW = ctx.measureText(paramsText).width;

  const gapCenter = clamp(width * 0.04, 24, 60);
  const logoGap = hasLogo ? 14 : 0;
  const sepGap = hasLogo ? 12 : 10;
  const sepW = hasLogo ? 2 : 0;

  let topW = modelW + gapCenter + logoW + logoGap + sepW + sepGap + paramsW;
  if (topW > width - 32) {
    const scale = (width - 32) / topW;
    modelSize = Math.max(14, Math.floor(modelSize * scale));
    paramsSize = Math.max(12, Math.floor(paramsSize * scale));
    modelMaxW *= scale;
    paramsMaxW *= scale;

    ctx.font = `${modelSize}px ${modelFontFamily}`;
    const modelTextScaled = fitText(ctx, modelRaw, modelMaxW);
    const modelWScaled = ctx.measureText(modelTextScaled).width;

    ctx.font = `${paramsSize}px ${paramsFontFamily}`;
    const paramsTextScaled = fitText(ctx, paramsRaw, paramsMaxW);
    const paramsWScaled = ctx.measureText(paramsTextScaled).width;

    topW = modelWScaled + gapCenter + logoW + logoGap + sepW + sepGap + paramsWScaled;

    await drawTopActual(
      ctx,
      {
        width,
        topW,
        modelText: modelTextScaled,
        paramsText: paramsTextScaled,
        modelW: modelWScaled,
        modelSize,
        paramsSize,
        logoW,
        logoH,
        gapCenter,
        logoGap,
        sepGap,
        sepW,
        modelY,
        paramsY,
        baseY,
        hasLogo,
        modelFontFamily,
        paramsFontFamily,
      },
      payload.colors,
      logoObj,
    );
    return;
  }

  await drawTopActual(
    ctx,
    {
      width,
      topW,
      modelText,
      paramsText,
      modelW,
      modelSize,
      paramsSize,
      logoW,
      logoH,
      gapCenter,
      logoGap,
      sepGap,
      sepW,
      modelY,
      paramsY,
      baseY,
      hasLogo,
      modelFontFamily,
      paramsFontFamily,
    },
    payload.colors,
    logoObj,
  );
}

async function drawTopActual(ctx, geo, colors, logoObj) {
  const startX = (geo.width - geo.topW) / 2;
  const modelX = startX;
  const rightX = modelX + geo.modelW + geo.gapCenter;

  const logoX = rightX;
  const logoY = geo.baseY - geo.logoH * 0.72;

  const sepX = logoX + geo.logoW + geo.logoGap;
  const sepTop = geo.baseY - geo.logoH * 0.7;
  const sepBottom = geo.baseY + geo.logoH * 0.22;

  const paramsX = sepX + geo.sepW + geo.sepGap;

  ctx.fillStyle = colors.mainText;
  ctx.font = `${geo.modelSize}px ${geo.modelFontFamily}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(geo.modelText, modelX, geo.modelY);

  if (geo.hasLogo) {
    ctx.strokeStyle = colors.separator;
    ctx.lineWidth = geo.sepW;
    ctx.beginPath();
    ctx.moveTo(sepX, sepTop);
    ctx.lineTo(sepX, sepBottom);
    ctx.stroke();
  }

  ctx.font = `${geo.paramsSize}px ${geo.paramsFontFamily}`;
  ctx.fillStyle = colors.mainText;
  ctx.fillText(geo.paramsText, paramsX, geo.paramsY);

  if (geo.hasLogo && logoObj && logoObj.logo) {
    const logoImg = await getLogoImage(logoObj.logo);
    if (logoImg) {
      ctx.drawImage(logoImg, logoX, logoY, geo.logoW, geo.logoH);
    }
  }
}

function drawBottomLine(ctx, payload) {
  const { width, height, frameHeight, colors, infoState } = payload;
  if (!infoState.bottomText) {
    return;
  }

  const y = height + frameHeight * 0.78;
  const size = clamp(width * 0.016, 12, 24);
  const subFontFamily = getCanvasFontFamily(infoState.selectedBrand, "Regular");

  ctx.font = `${size}px ${subFontFamily}`;
  const text = fitText(ctx, infoState.bottomText, width - 40);
  const textW = ctx.measureText(text).width;

  ctx.fillStyle = colors.subText;
  ctx.fillText(text, (width - textW) / 2, y);
}

function getTheme() {
  const selected = document.querySelector("input[name='theme']:checked");
  return selected ? selected.value : "white";
}

function getThemeColors(theme) {
  if (theme === "black") {
    return {
      background: "#000000",
      mainText: "#ffffff",
      subText: "#b8b8b8",
      separator: "#6c6c6c",
    };
  }

  return {
    background: "#ffffff",
    mainText: "#000000",
    subText: "#656565",
    separator: "#c2c2c2",
  };
}

function getBrandById(id) {
  return state.brands.find((item) => item.id === id) || null;
}

async function ensureFontFallbackForBrand(brand) {
  const googleBrand = getBrandById("google") || { id: "google", folder: "Google", fontPrefix: "Google" };
  await ensureBrandFontsLoaded(googleBrand);

  if (!brand || brand.id === "google") {
    return;
  }

  const loadedCurrent = await ensureBrandFontsLoaded(brand);
  if (loadedCurrent) {
    return;
  }

  const xiaomiBrand = getBrandById("xiaomi");
  if (xiaomiBrand && xiaomiBrand.id !== brand.id) {
    await ensureBrandFontsLoaded(xiaomiBrand);
  }
}

async function ensureBrandFontsLoaded(brand) {
  if (!brand) {
    return false;
  }

  let loadedAny = false;
  for (const weight of FONT_WEIGHTS) {
    const key = `${brand.id}:${weight}`;
    if (state.fontLoadResult.get(key) === true) {
      loadedAny = true;
      continue;
    }
    if (state.fontLoadResult.get(key) === false) {
      continue;
    }

    const family = getBrandFamilyName(brand, weight);
    const candidates = collectFontCandidates(brand, weight);
    let loaded = false;

    for (const path of candidates) {
      loaded = await loadFontFace(family, path);
      if (loaded) {
        break;
      }
    }

    state.fontLoadResult.set(key, loaded);
    if (loaded) {
      state.loadedFontFamilies.add(family);
      loadedAny = true;
    }
  }

  return loadedAny;
}

function getBrandFamilyName(brand, weight) {
  const prefix = String((brand && brand.fontPrefix) || (brand && brand.folder) || toTitleCase((brand && brand.id) || "Google") || "Google");
  return `${prefix}-${weight}`;
}

function collectFontCandidates(brand, weight) {
  const folder = String((brand && brand.folder) || "").trim() || toTitleCase((brand && brand.id) || "");
  const prefix = String((brand && brand.fontPrefix) || folder).trim() || folder;
  const variantWeights = weight === "SemiBold" ? ["SemiBold", "Semibold", "Bold"] : [weight];
  const candidates = [];

  for (const variant of variantWeights) {
    candidates.push(`./assests/${folder}/${prefix}-${variant}.ttf`);
    candidates.push(`./assests/${folder}/${prefix}-${variant}.otf`);
  }

  return [...new Set(candidates)];
}

async function loadFontFace(family, path) {
  try {
    if (document.fonts.check(`16px "${family}"`)) {
      return true;
    }
    const face = new FontFace(family, `url(${path})`);
    await face.load();
    document.fonts.add(face);
    return true;
  } catch (err) {
    return false;
  }
}

function getCanvasFontFamily(brand, weight) {
  const brandFamily = getBrandFamilyName(brand, weight);
  const googleFamily = `Google-${weight}`;
  const xiaomiFamily = `Xiaomi-${weight}`;
  const familyList = [];

  if (state.loadedFontFamilies.has(brandFamily)) {
    familyList.push(`"${brandFamily}"`);
  }
  familyList.push(`"${googleFamily}"`);

  if (state.loadedFontFamilies.has(xiaomiFamily)) {
    familyList.push(`"${xiaomiFamily}"`);
  }

  familyList.push("\"Segoe UI\"", "\"Microsoft YaHei UI\"", "sans-serif");
  return familyList.join(", ");
}

function normalizeLatLngText(text) {
  if (!text) {
    return "";
  }

  const pair = text.split(",").map((item) => item.trim());
  if (pair.length !== 2) {
    return text;
  }

  const lat = Number(pair[0]);
  const lon = Number(pair[1]);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }
  return text;
}

function extractExifForReuse(sourceDataUrl) {
  if (!window.piexif) {
    return null;
  }

  try {
    const exifObj = window.piexif.load(sourceDataUrl);
    const hasExif = Object.values(exifObj || {}).some((ifd) => ifd && Object.keys(ifd).length > 0);
    return hasExif ? exifObj : null;
  } catch (err) {
    return null;
  }
}

function tryInsertExif(baseJpegDataUrl, sourceExifObj) {
  if (!window.piexif || !sourceExifObj) {
    return baseJpegDataUrl;
  }

  try {
    const clone = JSON.parse(JSON.stringify(sourceExifObj));
    if (clone["0th"]) {
      clone["0th"][window.piexif.ImageIFD.Orientation] = 1;
    }
    const exifBytes = window.piexif.dump(clone);
    return window.piexif.insert(exifBytes, baseJpegDataUrl);
  } catch (err) {
    return baseJpegDataUrl;
  }
}

function downloadImage() {
  if (!state.outputDataUrl) {
    updateStatus("请先生成预览。", true);
    return;
  }

  const a = document.createElement("a");
  a.href = state.outputDataUrl;
  a.download = buildDownloadName(state.outputExt);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function buildDownloadName(ext) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = String(ext || "jpg").replace(/\./g, "");
  return `framed-${stamp}.${suffix}`;
}

function updateStatus(message, isWarn) {
  els.statusText.textContent = message;
  els.statusText.style.color = isWarn ? "#666666" : "#4b4b4b";
}

function formatExifTime(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date && !isNaN(value)) {
    return formatDate(value);
  }

  const raw = String(value).trim();
  if (/^\d{4}:\d{2}:\d{2}/.test(raw)) {
    const normalized = raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
    return normalized.replace("T", " ");
  }

  const date = new Date(raw);
  if (!isNaN(date)) {
    return formatDate(date);
  }

  return raw;
}

function formatNow() {
  return formatDate(new Date());
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  const hh = `${date.getHours()}`.padStart(2, "0");
  const mm = `${date.getMinutes()}`.padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function toOneDecimal(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return "";
  }
  return trimNum(n.toFixed(1));
}

function trimNum(value) {
  return String(value).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function fitText(ctx, text, maxWidth) {
  let value = String(text || "");
  if (ctx.measureText(value).width <= maxWidth) {
    return value;
  }

  while (value.length > 1 && ctx.measureText(`${value}...`).width > maxWidth) {
    value = value.slice(0, -1);
  }

  return `${value}...`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(String(reader.result || ""));
    };
    reader.onerror = () => {
      reject(reader.error || new Error("读取文件失败"));
    };
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      reject(new Error("图片加载失败"));
    };
    img.src = src;
  });
}

async function getLogoImage(src) {
  if (!src) {
    return null;
  }

  if (!state.logoCache.has(src)) {
    state.logoCache.set(src, loadImage(src).catch(() => null));
  }

  return state.logoCache.get(src);
}
