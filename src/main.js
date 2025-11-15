import './styles.css';
import config from '@/config.js';
import {
  sendChatMessage,
  sendVoiceMessage,
  dispatchMapSet,
  sendRobotPlay
} from '@/services/apiClient.js';
import { AudioRecorder } from '@/media/audioRecorder.js';
import {
  loadEmojiByName,
  listPredefinedEmojis,
  buildMatrixPayload
} from '@/emoji/emojiProcessor.js';
import {
  resetTab,
  appendHistory,
  getHistory,
  markChatContinued,
  markChatRestarted,
  isNewChat,
  setCurrentEmoji,
  getPersona,
  updatePersona,
  resetPersona
} from '@/state/session.js';

const tabButtons = Array.from(document.querySelectorAll('.tab-button'));
const panels = Array.from(document.querySelectorAll('.tab-panel'));

const voiceStatus = document.getElementById('voice-status');
const recordBtn = document.getElementById('record-btn');
const stopRecordBtn = document.getElementById('stop-record-btn');
const sendVoiceBtn = document.getElementById('send-voice-btn');
const restartVoiceBtn = document.getElementById('restart-voice-btn');
const voiceHistoryContainer = document.getElementById('voice-history');
const voicePlayback = document.getElementById('voice-playback');

const personaRoleInput = document.getElementById('persona-role');
const personaRelationshipInput = document.getElementById('persona-relationship');
const personaResetBtn = document.getElementById('persona-reset-btn');

const textInput = document.getElementById('text-input');
const sendTextBtn = document.getElementById('send-text-btn');
const restartTextBtn = document.getElementById('restart-text-btn');
const textHistoryContainer = document.getElementById('text-history');

const emojiSelect = document.getElementById('emoji-select');
const emojiPreviewSection = document.getElementById('emoji-preview');
const emojiPreviewImage = document.getElementById('emoji-preview-image');
const emojiMatrixContainer = document.getElementById('emoji-matrix');
const applyEmojiBtn = document.getElementById('apply-emoji-btn');

let lastRecordedBlob = null;
let recorder = null;
let isSendingVoice = false;
let isSendingText = false;
let selectedEmoji = null;
let selectedEmojiMatrix = null;

function setActiveTab(tabName) {
  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  panels.forEach((panel) => {
    const isActive = panel.id === `tab-${tabName}`;
    panel.toggleAttribute('hidden', !isActive);
    panel.classList.toggle('active', isActive);
  });
}

tabButtons.forEach((button) => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});

function updateVoiceStatus(text) {
  voiceStatus.textContent = text;
}

function setVoiceControls({ recording = false, recorded = false, sending = false }) {
  recordBtn.disabled = recording || sending;
  stopRecordBtn.disabled = !recording;
  sendVoiceBtn.disabled = !recorded || recording || sending;
  restartVoiceBtn.disabled = recording || sending;
}

function createRecorder() {
  if (recorder) {
    return;
  }

  recorder = new AudioRecorder({
    onStart: () => {
      updateVoiceStatus('Đang ghi âm...');
      lastRecordedBlob = null;
      voicePlayback.hidden = true;
      setVoiceControls({ recording: true, recorded: false });
    },
    onStop: (blob) => {
      if (!blob) {
        updateVoiceStatus('Không có dữ liệu ghi âm.');
        setVoiceControls({ recording: false, recorded: false });
        return;
      }

      lastRecordedBlob = blob;
      updateVoiceStatus('Ghi âm hoàn tất. Sẵn sàng gửi.');
      setVoiceControls({ recording: false, recorded: true });
      const objectUrl = URL.createObjectURL(blob);
      voicePlayback.src = objectUrl;
      voicePlayback.hidden = false;
    },
    onError: (error) => {
      console.error('AudioRecorder error', error);
      updateVoiceStatus('Không thể truy cập micro: ' + error.message);
      setVoiceControls({ recording: false, recorded: false });
    }
  });
}

async function handleStartRecording() {
  createRecorder();
  try {
    await recorder.start();
  } catch (error) {
    console.error(error);
    updateVoiceStatus('Không thể bắt đầu ghi âm: ' + error.message);
  }
}

function handleStopRecording() {
  if (!recorder) {
    return;
  }
  recorder.stop();
}

function syncPersonaInputs() {
  const persona = getPersona();
  personaRoleInput.value = persona.role || '';
  personaRelationshipInput.value = persona.relationship || '';
}

function addHistoryMessage(tab, message) {
  appendHistory(tab, {
    ...message,
    timestamp: new Date().toISOString()
  });
  renderHistory(tab);
}

function createMessageElement(message) {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${message.role}`;

  const header = document.createElement('div');
  header.className = 'message-header';
  header.textContent = message.role === 'user' ? 'Bạn' : 'Robot/AI';
  wrapper.appendChild(header);

  const body = document.createElement('div');
  body.className = 'message-body';

  if (message.text) {
    const paragraph = document.createElement('p');
    paragraph.textContent = message.text;
    body.appendChild(paragraph);
  }

  if (message.type === 'voice' && message.blob) {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = URL.createObjectURL(message.blob);
    body.appendChild(audio);
  }

  if (message.emojiUrl) {
    const img = document.createElement('img');
    img.src = message.emojiUrl;
    img.alt = `Emoji ${message.emojiName}`;
    img.width = 64;
    img.height = 64;
    body.appendChild(img);
  }

  wrapper.appendChild(body);
  return wrapper;
}

function renderHistory(tab) {
  const history = getHistory(tab);
  const container = tab === 'voice' ? voiceHistoryContainer : textHistoryContainer;
  container.innerHTML = '';

  history.forEach((message) => {
    container.appendChild(createMessageElement(message));
  });

  container.scrollTo({ top: container.scrollHeight });
}

function decodeBase64Audio(base64, mime = 'audio/wav') {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes.buffer], { type: mime });
}

async function extractAudioBlob(response) {
  if (!response) {
    return null;
  }

  // Nếu có audio_path hoặc audio_filename, download từ AI server
  if (response.audio_path || response.audio_filename) {
    let audioFile = response.audio_path || response.audio_filename;
    // Chuyển backslash thành forward slash cho URL
    audioFile = audioFile.replace(/\\/g, '/');
    // Đảm bảo bắt đầu bằng /
    if (!audioFile.startsWith('/')) {
      audioFile = '/' + audioFile;
    }
    // Tạo URL tới file audio trên AI server
    const audioUrl = `${config.aiServer.baseUrl}${audioFile}`;
    
    try {
      console.log('📥 Downloading audio from:', audioUrl);
      const res = await fetch(audioUrl);
      if (!res.ok) {
        console.warn('❌ Không tải được audio từ:', audioUrl);
        return null;
      }
      const buffer = await res.arrayBuffer();
      console.log('✅ Audio downloaded:', buffer.byteLength, 'bytes');
      return new Blob([buffer], { type: 'audio/wav' });
    } catch (error) {
      console.error('❌ Lỗi tải audio:', error);
      return null;
    }
  }

  if (response.audio_url) {
    const res = await fetch(response.audio_url);
    const buffer = await res.arrayBuffer();
    return new Blob([buffer], { type: 'audio/wav' });
  }

  if (response.voice_url) {
    const res = await fetch(response.voice_url);
    const buffer = await res.arrayBuffer();
    return new Blob([buffer], { type: 'audio/wav' });
  }

  if (response.audio_base64) {
    return decodeBase64Audio(response.audio_base64, response.audio_mime || 'audio/wav');
  }

  return null;
}

async function prepareEmoji(name, { dispatch = true } = {}) {
  if (!name) {
    return null;
  }

  const emojiData = await loadEmojiByName(name);
  const payload = buildMatrixPayload(emojiData.matrix);
  setCurrentEmoji(name, payload);

  let dispatchResults = null;
  if (dispatch) {
    dispatchResults = await dispatchMapSet(payload);
  }

  return { emojiData, payload, dispatchResults };
}

async function handleVoiceSend() {
  if (!lastRecordedBlob || isSendingVoice) {
    return;
  }

  isSendingVoice = true;
  setVoiceControls({ recording: false, recorded: true, sending: true });
  updateVoiceStatus('Đang gửi lên AI server...');

  addHistoryMessage('voice', {
    role: 'user',
    type: 'voice',
    text: 'Gửi voice message',
    blob: lastRecordedBlob
  });

  try {
    const persona = getPersona();
    const composedRole = buildPersonaRole(persona);
    const response = await sendVoiceMessage({
      blob: lastRecordedBlob,
      role: composedRole,
      isNewChat: isNewChat('voice')
    });

    markChatContinued('voice');

    console.log('📥 AI Server Response:', response);

    const emojiName = response.emoji || response.emoji_name;
    let emojiUrl = null;

    if (emojiName) {
      try {
        const { emojiData } = await prepareEmoji(emojiName, { dispatch: true });
        emojiUrl = emojiData.url;
      } catch (error) {
        console.warn('Không thể xử lý emoji', error);
      }
    }

    const audioBlob = await extractAudioBlob(response);
    console.log('🎵 Audio Blob extracted:', audioBlob ? `${audioBlob.size} bytes` : 'null');
    
    if (audioBlob) {
      const objectUrl = URL.createObjectURL(audioBlob);
      voicePlayback.src = objectUrl;
      voicePlayback.hidden = false;

      try {
        console.log('📤 Sending audio to robot /play...');
        await sendRobotPlay(audioBlob);
        console.log('✅ Audio sent to robot successfully');
      } catch (error) {
        console.error('❌ Không gửi được audio tới robot', error);
      }
    } else {
      console.warn('⚠️ Không có audio trong response từ AI server');
    }

    addHistoryMessage('voice', {
      role: 'ai',
      text: response.final_response || response.text || '(Không có nội dung text)',
      emojiName,
      emojiUrl
    });

    updateVoiceStatus('Đã nhận phản hồi từ AI.');
  } catch (error) {
    console.error('Voice send error', error);
    updateVoiceStatus('Lỗi gửi voice: ' + error.message);
  } finally {
    isSendingVoice = false;
    setVoiceControls({ recording: false, recorded: Boolean(lastRecordedBlob), sending: false });
  }
}

function handleVoiceRestart() {
  resetTab('voice');
  markChatRestarted('voice');
  voiceHistoryContainer.innerHTML = '';
  voicePlayback.hidden = true;
  lastRecordedBlob = null;
  updateVoiceStatus('Đã restart chat.');
  setVoiceControls({ recording: false, recorded: false, sending: false });
}

async function handleTextSend() {
  if (isSendingText) {
    return;
  }

  const text = textInput.value.trim();
  if (!text) {
    return;
  }

  isSendingText = true;
  sendTextBtn.disabled = true;
  restartTextBtn.disabled = true;

  addHistoryMessage('text', {
    role: 'user',
    text
  });

  try {
    const persona = getPersona();
    const composedRole = buildPersonaRole(persona);
    const response = await sendChatMessage({
      text,
      role: composedRole,
      isNewChat: isNewChat('text')
    });

    markChatContinued('text');

    console.log('📥 AI Server Response (Text):', response);

    const emojiName = response.emoji || response.emoji_name;
    let emojiUrl = null;

    if (emojiName) {
      try {
        const { emojiData } = await prepareEmoji(emojiName, { dispatch: true });
        emojiUrl = emojiData.url;
      } catch (error) {
        console.warn('Không thể xử lý emoji', error);
      }
    }

    // Kiểm tra xem có audio không (bao gồm audio_path và audio_filename)
    if (response.audio_base64 || response.audio_url || response.voice_url || response.audio_path || response.audio_filename) {
      console.log('🎵 Text chat has audio, extracting...');
      const audioBlob = await extractAudioBlob(response);
      if (audioBlob) {
        try {
          console.log('📤 Sending text audio to robot /play...');
          await sendRobotPlay(audioBlob);
          console.log('✅ Text audio sent to robot successfully');
        } catch (error) {
          console.error('❌ Không gửi audio text tới robot', error);
        }
      }
    } else {
      console.log('ℹ️ Text response không có audio');
    }

    addHistoryMessage('text', {
      role: 'ai',
      text: response.final_response || response.text || '(Không có nội dung text)',
      emojiName,
      emojiUrl
    });
  } catch (error) {
    console.error('Text send error', error);
    addHistoryMessage('text', {
      role: 'ai',
      text: 'Lỗi gửi text: ' + error.message
    });
  } finally {
    isSendingText = false;
    textInput.value = '';
    sendTextBtn.disabled = false;
    restartTextBtn.disabled = false;
  }
}

function handleTextRestart() {
  resetTab('text');
  markChatRestarted('text');
  textHistoryContainer.innerHTML = '';
}

function handlePersonaChange() {
  const role = personaRoleInput.value.trim();
  const relationship = personaRelationshipInput.value.trim();
  updatePersona({
    role: role || config.chatTemplate.defaultRole,
    relationship
  });
}

function handlePersonaReset() {
  const persona = resetPersona();
  personaRoleInput.value = persona.role || '';
  personaRelationshipInput.value = persona.relationship || '';
}

function buildPersonaRole({ role, relationship }) {
  if (relationship) {
    return `${role} | Quan hệ: ${relationship}`;
  }
  return role;
}

function renderEmojiMatrix(colors) {
  emojiMatrixContainer.innerHTML = '';
  if (!colors) {
    return;
  }

  colors.forEach((row) => {
    row.forEach((color) => {
      const cell = document.createElement('div');
      cell.className = 'matrix-cell';
      cell.style.setProperty('--cell-color', color);
      cell.style.backgroundColor = color;
      emojiMatrixContainer.appendChild(cell);
    });
  });
}

async function selectEmojiByName(name) {
  if (!name) {
    return;
  }

  try {
    const { emojiData } = await prepareEmoji(name, { dispatch: false });
    selectedEmoji = emojiData.name;
    selectedEmojiMatrix = emojiData.matrix;
    emojiPreviewImage.src = emojiData.url;
    emojiPreviewImage.alt = `Emoji ${emojiData.name}`;
    renderEmojiMatrix(emojiData.colors);
    emojiPreviewSection.hidden = false;
  } catch (error) {
    console.error('Không tải được emoji', error);
    emojiPreviewSection.hidden = true;
  }
}

function renderEmojiOptions() {
  const entries = listPredefinedEmojis();
  emojiSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = entries.length ? 'Chọn emoji...' : 'Không có emoji nào';
  placeholder.disabled = !entries.length;
  placeholder.selected = true;
  emojiSelect.appendChild(placeholder);

  entries.forEach((emoji) => {
    const option = document.createElement('option');
    option.value = emoji.name;
    option.textContent = emoji.label;
    emojiSelect.appendChild(option);
  });

  if (entries.length) {
    emojiSelect.value = entries[0].name;
    selectEmojiByName(entries[0].name);
  } else {
    selectedEmoji = null;
    selectedEmojiMatrix = null;
    emojiPreviewSection.hidden = true;
  }
}

async function handleApplyEmoji() {
  if (!selectedEmoji || !selectedEmojiMatrix) {
    return;
  }

  try {
    const payload = buildMatrixPayload(selectedEmojiMatrix);
    await dispatchMapSet(payload);
  } catch (error) {
    console.error('Không thể gửi emoji tới robot', error);
  }
}

function initVoiceTab() {
  setVoiceControls({ recording: false, recorded: false, sending: false });
  recordBtn.addEventListener('click', handleStartRecording);
  stopRecordBtn.addEventListener('click', handleStopRecording);
  sendVoiceBtn.addEventListener('click', handleVoiceSend);
  restartVoiceBtn.addEventListener('click', handleVoiceRestart);
  personaRoleInput.addEventListener('input', handlePersonaChange);
  personaRelationshipInput.addEventListener('input', handlePersonaChange);
  personaResetBtn.addEventListener('click', handlePersonaReset);
}

function initTextTab() {
  sendTextBtn.addEventListener('click', handleTextSend);
  restartTextBtn.addEventListener('click', handleTextRestart);
}

function initEmojiTab() {
  renderEmojiOptions();
  emojiSelect.addEventListener('change', (event) => {
    const name = event.target.value;
    if (!name) {
      emojiPreviewSection.hidden = true;
      selectedEmoji = null;
      selectedEmojiMatrix = null;
      return;
    }

    selectEmojiByName(name);
  });
  applyEmojiBtn.addEventListener('click', handleApplyEmoji);
}

function init() {
  initVoiceTab();
  initTextTab();
  initEmojiTab();
  syncPersonaInputs();
  markChatRestarted('voice');
  markChatRestarted('text');
}

init();
