# 🚀 Professional Image Downloader & Organizer

Production-ready Node.js application for bulk image downloading, renaming, and organization with parallel processing.

## ⚡ Quick Start

### Option 1: Double-Click (Easy)

- **`download.bat`**: Downloads images from Excel files.
- **`rename.bat`**: Renames generated images and moves completed folders to `done/`.

### Option 2: Command Line

```bash
npm install
npm run download
npm run rename
```

## ✨ Features

| Feature            | Description                                                        |
| ------------------ | ------------------------------------------------------------------ |
| 🔍 **Auto-detect** | Finds Excel files, auto-detects header row, Category & SKU columns |
| ⚡ **Parallel**    | 10 concurrent downloads (configurable)                             |
| 📂 **Categories**  | Organizes downloads into `Category/SKU/` folder structure          |
| 🏷️ **Renamer**     | Smartly renames new images to follow sequence (e.g. `_6`→`_7`)     |
| 🔄 **Resume**      | Ctrl+C saves progress, run again to continue                      |
| 📊 **Reports**     | Summary Excel with per-category statistics                         |

## 📂 Workflow

1.  **Download**: Run `download.bat`. Images go to `downloads/Category/SKU/`.
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

- **Category English**: Auto-detected, used for top-level folder names
- **SKU**: Auto-detected, used for subfolder names
- **URL columns**: Any column matching "URL 1" through "URL 9"

## License

MIT
