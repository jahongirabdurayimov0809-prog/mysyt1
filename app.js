"use strict";

const languages = [
  ["auto", "Tilni aniqlash"],
  ["af", "Afrikaans"], ["sq", "Albancha"], ["am", "Amxarcha"], ["ar", "Arabcha"],
  ["hy", "Armancha"], ["az", "Ozarbayjoncha"], ["bn", "Bengalcha"], ["bg", "Bolgarcha"],
  ["my", "Burmacha"], ["zh", "Xitoycha"], ["hr", "Xorvatcha"], ["cs", "Chexcha"],
  ["da", "Datcha"], ["nl", "Niderlandcha"], ["en", "Inglizcha"], ["et", "Estoncha"],
  ["fi", "Fincha"], ["fr", "Fransuzcha"], ["ka", "Gruzincha"], ["de", "Nemischa"],
  ["el", "Yunoncha"], ["gu", "Gujarati"], ["ha", "Hausa"], ["he", "Ibroniycha"],
  ["hi", "Hindcha"], ["hu", "Vengercha"], ["id", "Indonezcha"], ["it", "Italyancha"],
  ["ja", "Yaponcha"], ["kn", "Kannada"], ["kk", "Qozoqcha"], ["km", "Kxmercha"],
  ["ko", "Koreyscha"], ["lo", "Laoscha"], ["lv", "Latishcha"], ["lt", "Litvacha"],
  ["ms", "Malaycha"], ["ml", "Malayalam"], ["mr", "Marathcha"], ["mn", "Mo‘g‘ulcha"],
  ["ne", "Nepalcha"], ["no", "Norvegcha"], ["fa", "Forscha"], ["pl", "Polyakcha"],
  ["pt", "Portugalcha"], ["pa", "Panjobcha"], ["ro", "Rumincha"], ["ru", "Ruscha"],
  ["sr", "Serbcha"], ["si", "Singalcha"], ["sk", "Slovakcha"], ["sl", "Slovencha"],
  ["so", "Somalicha"], ["es", "Ispancha"], ["sw", "Suahilicha"], ["sv", "Shvedcha"],
  ["tl", "Tagalog"], ["ta", "Tamilcha"], ["te", "Telugu"], ["th", "Taycha"],
  ["tr", "Turkcha"], ["uk", "Ukraincha"], ["ur", "Urdu"], ["uz", "O‘zbekcha"],
  ["vi", "Vetnamcha"],
];

const sourceLanguage = document.getElementById("source-language");
const targetLanguage = document.getElementById("target-language");
const sourceText = document.getElementById("source-text");
const mediaInput = document.getElementById("media-input");
const mediaFile = document.getElementById("media-file");
const selectedFile = document.getElementById("selected-file");
const uploadContent = document.getElementById("upload-content");
const translateButton = document.getElementById("translate-button");
const translationOutput = document.getElementById("translation-output");
const analysisCard = document.getElementById("analysis");
const recordButton = document.getElementById("record-audio");
let activeMode = "text";
let selectedMedia = null;
let recorder = null;
let recordingStream = null;
let recordingTimer = null;

function fillLanguages() {
  for (const [code, name] of languages) {
    const sourceOption = new Option(name, code);
    if (code === "auto") sourceOption.selected = true;
    sourceLanguage.add(sourceOption);
    if (code !== "auto") {
      const targetOption = new Option(name, code);
      if (code === "uz") targetOption.selected = true;
      targetLanguage.add(targetOption);
    }
  }
}

function displaySelectedFile(name, description) {
  uploadContent.hidden = true;
  selectedFile.hidden = false;
  selectedFile.textContent = `${name} · ${description}`;
}

function clearMedia() {
  selectedMedia = null;
  mediaFile.value = "";
  selectedFile.hidden = true;
  selectedFile.textContent = "";
  uploadContent.hidden = false;
}

function fileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string" || !dataUrl.includes(",")) {
        reject(new Error("Faylni o‘qib bo‘lmadi."));
        return;
      }
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    });
    reader.addEventListener("error", () => reject(new Error("Faylni o‘qib bo‘lmadi.")));
    reader.readAsDataURL(file);
  });
}

async function convertAudioToWav(file) {
  const audioContext = new AudioContext();
  let decoded;
  try {
    decoded = await audioContext.decodeAudioData(await file.arrayBuffer());
  } finally {
    await audioContext.close();
  }

  const sampleRate = 16000;
  const frameCount = Math.ceil(decoded.duration * sampleRate);
  const offlineContext = new OfflineAudioContext(1, frameCount, sampleRate);
  const source = offlineContext.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineContext.destination);
  source.start();
  const audioBuffer = await offlineContext.startRendering();
  const samples = audioBuffer.getChannelData(0);
  const wav = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(wav);
  const writeText = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new File([wav], "ovoz.wav", { type: "audio/wav" });
}

async function selectMedia(file) {
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    clearMedia();
    showError("Fayl 8 MB dan kichik bo‘lishi kerak.");
    return;
  }
  const mimeType = file.type.split(";")[0].toLowerCase();
  const isImage = mimeType.startsWith("image/");
  const validImage = ["image/jpeg", "image/png", "image/webp"].includes(mimeType);
  const validAudio = [
    "audio/aac", "audio/flac", "audio/mp3", "audio/mp4", "audio/mpeg",
    "audio/ogg", "audio/wav", "audio/webm", "audio/x-m4a", "audio/x-wav",
  ].includes(mimeType);
  if ((activeMode === "image" && (!isImage || !validImage)) ||
    (activeMode === "audio" && !validAudio)) {
    clearMedia();
    showError(activeMode === "image" ? "PNG, JPG yoki WEBP rasm tanlang." : "Qo‘llab-quvvatlanadigan audio fayl tanlang.");
    return;
  }
  try {
    const uploadFile = activeMode === "audio" && mimeType === "audio/webm"
      ? await convertAudioToWav(file)
      : file;
    const base64 = await fileAsBase64(uploadFile);
    selectedMedia = { name: uploadFile.name, mime_type: uploadFile.type, data: base64 };
    displaySelectedFile(uploadFile.name, `${(uploadFile.size / 1024 / 1024).toFixed(2)} MB`);
    clearError();
  } catch (error) {
    showError(error.message);
  }
}

function setMode(mode) {
  activeMode = mode;
  selectedMedia = null;
  mediaFile.value = "";
  selectedFile.hidden = true;
  selectedFile.textContent = "";
  uploadContent.hidden = false;
  for (const tab of document.querySelectorAll(".mode-tab")) {
    const selected = tab.dataset.mode === mode;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
  }
  const isText = mode === "text";
  sourceText.hidden = !isText;
  mediaInput.hidden = isText;
  recordButton.hidden = mode !== "audio";
  document.getElementById("character-count").hidden = !isText;
  document.getElementById("input-label").textContent =
    mode === "text" ? "MATN" : mode === "image" ? "RASM" : "OVOZ";
  mediaFile.accept = mode === "image" ? "image/jpeg,image/png,image/webp" : "audio/*";
  document.getElementById("upload-icon").textContent = mode === "image" ? "▧" : "◖";
  document.getElementById("upload-title").textContent =
    mode === "image" ? "Rasmni shu yerga tashlang" : "Audio faylni shu yerga tashlang";
  document.getElementById("upload-description").textContent =
    mode === "image" ? "yoki qurilmangizdan tanlang · PNG, JPG, WEBP" : "yoki qurilmangizdan tanlang · MP3, WAV, M4A, WEBM";
  document.getElementById("output-hint").textContent = "Tarjima natijasi va AI tahlili shu yerda chiqadi.";
  clearError();
}

function showError(message) {
  analysisCard.hidden = true;
  document.getElementById("copy-translation").disabled = true;
  translationOutput.textContent = message;
  translationOutput.classList.add("has-result", "error-output");
}

function clearError() {
  translationOutput.classList.remove("error-output");
}

sourceText.addEventListener("input", () => {
  document.getElementById("character-count").textContent =
    `${sourceText.value.length.toLocaleString("uz-UZ")} / 40 000`;
});

for (const tab of document.querySelectorAll(".mode-tab")) {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
}

document.getElementById("choose-file").addEventListener("click", () => mediaFile.click());
mediaFile.addEventListener("change", () => selectMedia(mediaFile.files[0]));
document.getElementById("clear-input").addEventListener("click", () => {
  sourceText.value = "";
  document.getElementById("character-count").textContent = "0 / 40 000";
  clearMedia();
  clearError();
});

document.getElementById("swap-languages").addEventListener("click", () => {
  if (sourceLanguage.value === "auto") {
    sourceLanguage.value = targetLanguage.value;
    targetLanguage.value = "uz";
    if (sourceLanguage.value === targetLanguage.value) targetLanguage.value = "en";
    return;
  }
  const oldSource = sourceLanguage.value;
  sourceLanguage.value = targetLanguage.value;
  targetLanguage.value = oldSource;
});

document.getElementById("copy-translation").addEventListener("click", async () => {
  const text = translationOutput.textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    document.getElementById("copy-translation").querySelector("span").textContent = "Nusxalandi";
    setTimeout(() => {
      document.getElementById("copy-translation").querySelector("span").textContent = "Nusxalash";
    }, 1400);
  } catch {
    showError("Nusxalash bajarilmadi. Matnni belgilang va qo‘lda nusxalang.");
  }
});

translateButton.addEventListener("click", async () => {
  const text = sourceText.value.trim();
  if (activeMode === "text" && !text) {
    showError("Tarjima qilinadigan matnni kiriting.");
    sourceText.focus();
    return;
  }
  if (activeMode !== "text" && !selectedMedia) {
    showError(activeMode === "image" ? "Avval rasm tanlang." : "Avval audio fayl tanlang yoki ovoz yozing.");
    return;
  }

  clearError();
  translateButton.disabled = true;
  translateButton.innerHTML = "<span>✳</span> Tarjima qilinmoqda…";
  translationOutput.textContent = "Gemini tarjima va tahlil tayyorlamoqda…";
  translationOutput.classList.remove("has-result");
  analysisCard.hidden = true;
  document.getElementById("copy-translation").disabled = true;
  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: activeMode,
        text,
        source_language: sourceLanguage.value,
        target_language: targetLanguage.value,
        media: selectedMedia,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Server xatosi (${response.status}).`);
    translationOutput.textContent = result.translation;
    translationOutput.classList.add("has-result");
    document.getElementById("analysis-text").textContent = result.analysis;
    document.getElementById("detected-language").textContent = `Aniqlangan til: ${result.source_language}`;
    analysisCard.hidden = false;
    document.getElementById("copy-translation").disabled = false;
    document.getElementById("output-hint").textContent = "Tarjima tayyor";
    analysisCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    showError(error instanceof TypeError
      ? "Serverga ulanib bo‘lmadi. Tarjimon serveri ishga tushganini tekshiring."
      : error.message);
  } finally {
    translateButton.disabled = false;
    translateButton.innerHTML = '<span>✳</span> Tarjima qilish <span class="button-arrow">→</span>';
  }
});

recordButton.addEventListener("click", async () => {
  if (recorder && recorder.state === "recording") {
    recorder.stop();
    recordButton.disabled = true;
    recordButton.textContent = "Ovoz saqlanmoqda…";
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showError("Brauzerda ovoz yozish qo‘llanmaydi. Audio fayl yuklang.");
    return;
  }
  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
      .find((type) => MediaRecorder.isTypeSupported(type));
    recorder = mimeType
      ? new MediaRecorder(recordingStream, { mimeType })
      : new MediaRecorder(recordingStream);
    const chunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener("stop", async () => {
      clearTimeout(recordingTimer);
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      try {
        const wavFile = await convertAudioToWav(blob);
        await selectMedia(wavFile);
      } catch {
        showError("Ovoz formatini o‘qib bo‘lmadi. Audio fayl yuklab ko‘ring.");
      }
      recordingStream?.getTracks().forEach((track) => track.stop());
      recordingStream = null;
      recordButton.disabled = false;
      recordButton.classList.remove("is-recording");
      recordButton.innerHTML = '<span class="mic-icon">●</span> Ovoz yozish';
    }, { once: true });
    recorder.start();
    recordButton.classList.add("is-recording");
    recordButton.textContent = "● To‘xtatish · 30s";
    recordingTimer = setTimeout(() => {
      if (recorder?.state === "recording") recorder.stop();
    }, 30_000);
    clearError();
  } catch {
    showError("Mikrofonga ruxsat berilmadi. Ruxsat bering yoki audio fayl yuklang.");
  }
});

document.getElementById("upload-content").addEventListener("dragover", (event) => event.preventDefault());
document.getElementById("upload-content").addEventListener("drop", (event) => {
  event.preventDefault();
  selectMedia(event.dataTransfer.files[0]);
});

fillLanguages();
