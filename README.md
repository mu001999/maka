# Maka

Maka is a modern, high-performance disk usage visualization tool built with Tauri, React, and Rust. It helps you quickly analyze your disk space usage with interactive charts.

## Features

- **Fast Scanning**: Powered by Rust's `rayon` for parallel processing and `dashmap` for concurrent caching.
- **Interactive Visualizations**:
  - **Sunburst Chart**: Visualize directory hierarchy and size distribution radially.
  - **Treemap Chart**: View disk usage as nested rectangles for easy size comparison.
- **Delete Zone**: Drag and drop items to a temporary holding area to review before permanently deleting them.
- **Drag & Drop**: Intuitive drag and drop interface for managing files and adding them to the Delete Zone.
- **Smart Navigation**:
  - **Breadcrumbs**: Interactive path navigation to quickly jump to parent directories.
  - **Depth Control**: Adjust the visualization depth to focus on high-level overview or deep details.
- **Modern UI**: Clean, dark-themed interface built with React and Tailwind-like CSS.
- **Cross-Platform**: Built on Tauri, running natively on macOS (and potentially Windows/Linux).
- **Privacy Focused**: Automatically handles Full Disk Access permissions on macOS to ensure complete scanning.

## Tech Stack

- **Frontend**: React, Vite, TypeScript, D3.js, Lucide React
- **Backend**: Rust, Tauri
- **State Management**: React Hooks
- **Styling**: Vanilla CSS (Modern features)
- **Permissions**: `tauri-plugin-macos-permissions-api`

## Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v16 or later)
- [Rust](https://www.rust-lang.org/) (latest stable)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/mu001999/maka.git
   cd maka
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

## Development

To run the application in development mode:

```bash
npm run tauri dev
```

This will start the Vite dev server and the Tauri application window.

## Build

To build the application for production:

```bash
npm run tauri build
```

The build artifacts (e.g., `.dmg` for macOS) will be located in `src-tauri/target/release/bundle/`.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
