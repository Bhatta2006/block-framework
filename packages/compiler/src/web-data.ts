import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const sourceDir = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
export const WEB_DATA_RUNTIME = readFileSync(
  resolve(sourceDir, '../../blocks/src/blocks/data.collection/web/DataCollection.tsx'),
  'utf8',
)
  .replace(/\r\n/g, '\n')
  .replace("'../shared/data-core.js'", "'./data-core.js'");
export const DATA_STYLES = String.raw`
.generated-app.notes-shell {
  background: #fff;
  color: #141414;
  font-family: Inter, system-ui, sans-serif;
  min-height: 100vh;
}
.notes-shell .app-header {
  background: #fff;
  border-bottom: 1px solid #e9e9e9;
  padding: 22px 5%;
}
.notes-shell .app-brand {
  color: #111;
}
.notes-shell .app-header-note,
.notes-shell .app-footer {
  display: none;
}
.notes-shell .app-header nav button.active {
  background: #111;
  color: white;
}
.notes-shell .page-content {
  max-width: 1180px;
  padding: 40px 40px 70px;
  gap: 24px;
}
.notes-shell .block-container {
  min-width: 0;
}
.notes-summary {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  font-size: 12px;
  color: #777;
  padding-bottom: 18px;
  border-bottom: 1px solid #eee;
}
.notes-summary > span {
  letter-spacing: 2px;
  font-size: 10px;
}
.notes-summary b {
  color: #111;
}
.notes-summary i {
  margin: 0 12px;
  font-style: normal;
  color: #ccc;
}
.notes-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 14px 0 30px;
}
.notes-kicker {
  font-size: 10px;
  letter-spacing: 2px;
  color: #777;
}
.notes-heading h1 {
  font-size: 42px;
  line-height: 1.2;
  letter-spacing: -1.7px;
  margin: 12px 0;
}
.notes-heading p {
  color: #888;
  font-size: 14px;
  margin: 0;
}
.notes-library button,
.note-editor button {
  cursor: pointer;
  border: 1px solid #e5e5e5;
  background: white;
  color: #222;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 12px;
}
.notes-library button:hover,
.note-editor button:hover {
  background: #f3f3f3;
}
.notes-library button:disabled {
  opacity: 0.5;
  cursor: default;
}
.notes-library .notes-primary,
.note-editor .notes-primary {
  background: #111;
  color: white;
  border-color: #111;
  padding: 13px 20px;
  font-weight: 600;
  white-space: nowrap;
}
.notes-tools {
  display: flex;
  gap: 10px;
}
.notes-tools input {
  flex: 1;
  min-width: 0;
  padding: 13px 16px;
  border: 1px solid #e5e5e5;
  border-radius: 9px;
  background: #fafafa;
  font-size: 13px;
}
.notes-tools select {
  border: 1px solid #e5e5e5;
  background: white;
  border-radius: 8px;
  font-size: 12px;
  padding: 8px;
  color: #444;
}
.notes-folders {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 16px 0 8px;
}
.notes-folders button {
  border: none;
  color: #777;
}
.notes-folders .selected {
  color: #111;
  background: #eee;
  font-weight: 600;
}
.notes-status {
  min-height: 18px;
  font-size: 11px;
  color: #888;
  margin: 12px 0 22px;
}
.notes-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.note-card {
  border: 1px solid #e5e5e5;
  border-radius: 12px;
  overflow: hidden;
  background: white;
  box-shadow: 0 2px 4px #00000002;
  transition:
    border-color 0.15s,
    transform 0.15s;
}
.note-card:hover {
  border-color: #aaa;
  transform: translateY(-2px);
}
.note-card .note-open {
  text-align: left;
  width: 100%;
  border: 0;
  border-radius: 0;
  padding: 22px;
  display: block;
  min-height: 190px;
}
.note-card .note-open:hover {
  background: white;
}
.note-meta {
  font-size: 10px;
  color: #888;
  letter-spacing: 0.5px;
}
.note-card h2 {
  font-size: 18px;
  line-height: 1.4;
  font-weight: 600;
  margin: 13px 0 10px;
  overflow-wrap: anywhere;
}
.note-card p {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 12px;
  color: #777;
  line-height: 1.8;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 0;
}
.note-tags {
  display: block;
  font-size: 10px;
  color: #888;
  margin-top: 14px;
}
.note-bottom {
  border-top: 1px solid #f0f0f0;
  margin: 0 18px;
  padding: 10px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 4px;
}
.note-bottom time {
  font-size: 10px;
  color: #999;
}
.note-bottom button {
  border: 0;
  padding: 5px 7px;
  font-size: 14px;
}
.note-bottom button[aria-pressed='true'] {
  color: #000;
  background: #eee;
}
.notes-list {
  grid-template-columns: 1fr;
}
.notes-list .note-open {
  min-height: 0;
}
.notes-list .note-card {
  display: grid;
  grid-template-columns: 1fr auto;
}
.notes-list .note-bottom {
  border: 0;
  flex-direction: column;
  justify-content: center;
}
.notes-empty {
  text-align: center;
  padding: 65px 20px;
  color: #777;
}
.notes-empty > span {
  font-size: 40px;
  color: #ccc;
}
.notes-empty h2 {
  font-size: 20px;
  color: #222;
  font-weight: 500;
}
.notes-empty p {
  font-size: 13px;
}
.notes-backup {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  color: #999;
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid #eee;
}
.notes-backup > span {
  margin-right: auto;
}
.notes-backup button {
  font-size: 11px;
  border: none;
  color: #777;
}
.note-editor {
  max-width: 820px;
  margin: auto;
}
.notes-editor-top,
.notes-editor-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  color: #888;
}
.notes-editor-top button {
  border: 0;
  padding-left: 0;
}
.note-editor fieldset {
  border: 0;
  padding: 0;
  margin: 32px 0;
  min-width: 0;
}
.note-title-input {
  font-size: 38px;
  font-weight: 600;
  letter-spacing: -1px;
  border: none;
  width: 100%;
  padding: 12px 0;
  background: transparent;
  outline: none;
}
.note-properties {
  display: flex;
  gap: 18px;
  align-items: end;
  margin: 20px 0;
  flex-wrap: wrap;
}
.note-properties label {
  font-size: 10px;
  color: #777;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.note-properties input,
.note-properties select {
  background: #fafafa;
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 8px;
  font-size: 12px;
  color: #444;
}
.note-format {
  border-top: 1px solid #eee;
  border-bottom: 1px solid #eee;
  padding: 10px 0;
  display: flex;
  gap: 8px;
}
.note-format button {
  border: 0;
}
.note-format button:last-child {
  margin-left: auto;
}
.note-editor textarea {
  width: 100%;
  min-height: 360px;
  border: 0;
  resize: vertical;
  padding: 28px 0;
  font:
    15px/1.9 system-ui,
    sans-serif;
  outline: none;
  background: transparent;
}
.note-markdown {
  min-height: 360px;
  padding: 12px 0;
  font-size: 15px;
  line-height: 1.9;
  overflow-wrap: anywhere;
}
.note-markdown label {
  display: flex;
  gap: 12px;
  margin: 10px 0;
}
.note-markdown h2 {
  font-size: 27px;
}
.note-markdown h3 {
  font-size: 21px;
}
.note-markdown input {
  accent-color: #111;
}
@media (max-width: 800px) {
  .notes-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .notes-shell .page-content {
    padding: 25px 22px 50px;
  }
  .notes-shell .app-header {
    flex-wrap: wrap;
    gap: 15px;
  }
  .notes-shell .app-header nav {
    flex-wrap: wrap;
  }
}
@media (max-width: 480px) {
  .notes-grid {
    grid-template-columns: 1fr;
  }
  .notes-heading h1 {
    font-size: 32px;
  }
  .notes-kicker {
    font-size: 8px;
  }
  .notes-heading {
    align-items: flex-start;
  }
  .notes-tools {
    flex-wrap: wrap;
  }
  .notes-tools input {
    flex-basis: 100%;
  }
  .notes-summary {
    flex-direction: column;
    gap: 8px;
  }
  .notes-backup {
    flex-wrap: wrap;
  }
  .notes-backup > span {
    flex-basis: 100%;
  }
  .note-title-input {
    font-size: 30px;
  }
  .notes-shell .app-header nav button {
    padding: 7px 9px;
    font-size: 11px;
  }
}
`;
