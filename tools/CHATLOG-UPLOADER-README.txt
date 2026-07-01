Raid Lead Dashboard Chat Log Uploader

This uploader watches your local WoWChatLog.txt and sends only L'ura Memory Game
symbol callouts to the Raid Lead Dashboard server.

It does not upload your full chat log.

Setup

1. Install Node.js 18 or newer from:
   https://nodejs.org/

2. Make sure WoW is writing chat logs.
   In game, run:
   /chatlog

3. Double-click:
   run-chatlog-uploader.cmd

4. Leave the command window open while raiding.

Tonight's bundled settings

Server:
https://raid-lead-dashboard.onrender.com

Warcraft Logs report:
https://www.warcraftlogs.com/reports/9cCvwW7hpDZ4Jz2x

Default chat log path:
C:\Program Files (x86)\World of Warcraft\_retail_\Logs\WoWChatLog.txt

If your WoWChatLog.txt is somewhere else, right-click run-chatlog-uploader.cmd,
choose Edit, and change the CHAT_LOG line.

Manual command

node chatlog-uploader.mjs --server https://raid-lead-dashboard.onrender.com --report-url https://www.warcraftlogs.com/reports/9cCvwW7hpDZ4Jz2x --file "C:\Program Files (x86)\World of Warcraft\_retail_\Logs\WoWChatLog.txt"
