const config = {
  aiServer: {
    baseUrl: '/api/',
    chatPath: '/chat/text',
    voicePath: '/chat/voice',
    mapSetPath: '/map_set',
    // Nếu cần token hoặc header tùy chỉnh, cấu hình tại đây.
    headers: {}
  },
  robot: {
    baseUrl: '/robot/',
    playPath: '/play',
    mapSetPath: '/map_set',
    playFormField: 'voice_file'
  },
  emoji: {
    basePath: '/all_emoji/all_emoji',
    // Nếu có danh sách emoji được tạo trước, thêm tại đây để hiển thị sẵn.
    predefined: []
  },
  chatTemplate: {
    defaultRole: 'Bạn bè thân mật, kết giao lâu năm',
    defaultRelationship: 'Luôn đồng hành và hỗ trợ nhau trong mọi cuộc trò chuyện.'
  },
  voiceForm: {
    fileField: 'file',
    roleField: 'role',
    textField: 'text',
    isNewChatField: 'is_new_chat'
  }
};

export default config;
