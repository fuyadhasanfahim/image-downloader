# 🚀 Professional Image Downloader & Organizer

Production-ready Node.js application for bulk image downloading, renaming, and organization with parallel processing.

## ⚡ Quick Start

### Option 1: Double-Click (Easy) hiding

- **`download.bat`**: Downloads images from Excel files.
- **`rename.bat`**: Renames generated images and moves completed folders to `done/`.

### Option 2: Command Line

```bash
npm install
npm run download
npm run rename
```

## ✨ Features

| Feature            | Description                                                    |
| ------------------ | -------------------------------------------------------------- |
| 🔍 **Auto-detect** | Finds Excel files in parent folder, auto-detects header row    |
| ⚡ **Parallel**    | 10 concurrent downloads (configurable)                         |
| 🏷️ **Renamer**     | Smartly renames new images to follow sequence (e.g. `_6`→`_7`) |
| 📂 **Organizer**   | Moves processed SKU folders to `done/` directory               |
| � **Resume**       | Ctrl+C saves progress, run again to continue                   |
| 📊 **Reports**     | Summary Excel with statistics                                  |

## 📂 Workflow

1.  **Download**: Run `download.bat`. Images go to `downloads/sku_name/`.
2.  **Add Images**: Place your generated/extra images in the SKU folders.
3.  **Rename**: Run `rename.bat`. It will:
    - Scan for the last number (e.g., `sku_5.jpg`).
    - Rename your new files to continue the sequence (`sku_6.jpg`, `sku_7.jpg`...).
    - Copy the folder to `done/`.

## ⚙️ Configuration (.env)

```env
CONCURRENCY=10          # Parallel downloads/renames
TIMEOUT=30000           # Request timeout (ms)
RETRY_ATTEMPTS=3        # Retry failed downloads
INPUT_PATH=             # Optional: specific file/folder
OUTPUT_DIR=downloads    # Output folder name
```

## 📋 Excel Format

- **Column A**: SKU (auto-detected)
- **URL columns**: Any column with "URL" in header

## License

MIT
