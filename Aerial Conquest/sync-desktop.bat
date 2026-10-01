@echo off
rem Copies the playable game and its sources from this folder to the Desktop copy (CLAUDE.md).
rem Pull main first (GitHub Desktop: Fetch origin, then Pull), then double-click this.
set "SRC=%~dp0"
set "DST=C:\Users\shado\OneDrive\Desktop\Claude\Aerial Conquest"
if not exist "%DST%" mkdir "%DST%"
robocopy "%SRC%src" "%DST%\src" /MIR /NFL /NDL /NJH /NJS /NP >nul
for %%F in (aerial-conquest.html build.js shell.html tsconfig.json README.md PLAN.md CLAUDE.md) do copy /Y "%SRC%%%F" "%DST%\" >nul
echo Aerial Conquest synced to %DST%
pause
