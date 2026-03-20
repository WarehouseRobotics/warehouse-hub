# Public Messaging Agentics

Chats with customers are handled by a separate isolated agent loop app that can connect to different consumer messenging platforms like Telegram and Whatsapp.

Primary channel used for development: Telegram


## Spam and Hammering Prevention

Every 5 messages or 300-characters or so we should check if the user is spamming us and block them for progressively increasing duration.