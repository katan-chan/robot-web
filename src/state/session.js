import config from '@/config.js';

const initialTabState = () => ({
  isNewChat: true,
  history: []
});

const defaultPersona = () => ({
  role: config.chatTemplate.defaultRole,
  relationship: config.chatTemplate.defaultRelationship || ''
});

const state = {
  voice: initialTabState(),
  text: initialTabState(),
  currentEmoji: null,
  persona: defaultPersona()
};

function ensureTab(tab) {
  if (!state[tab]) {
    state[tab] = initialTabState();
  }
}

export function resetTab(tab) {
  ensureTab(tab);
  state[tab] = initialTabState();
}

export function appendHistory(tab, message) {
  ensureTab(tab);
  state[tab].history.push(message);
}

export function getHistory(tab) {
  ensureTab(tab);
  return state[tab].history;
}

export function markChatContinued(tab) {
  ensureTab(tab);
  state[tab].isNewChat = false;
}

export function markChatRestarted(tab) {
  ensureTab(tab);
  state[tab].isNewChat = true;
}

export function isNewChat(tab) {
  ensureTab(tab);
  return state[tab].isNewChat;
}

export function setCurrentEmoji(name, matrix) {
  state.currentEmoji = { name, matrix };
}

export function getCurrentEmoji() {
  return state.currentEmoji;
}

export function getSummary() {
  return { ...state };
}

export function getPersona() {
  return { ...state.persona };
}

export function updatePersona(partial) {
  state.persona = {
    ...state.persona,
    ...partial
  };
  return getPersona();
}

export function resetPersona() {
  state.persona = defaultPersona();
  return getPersona();
}
