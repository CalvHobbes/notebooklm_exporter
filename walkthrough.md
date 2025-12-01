# NotebookLM Report Exporter Walkthrough

This extension adds a native-feeling "Export" button to NotebookLM, allowing you to save reports as Markdown files or print them as clean, formatted PDFs.

## Features

### 1. Native Integration
- **Seamless UI:** The "Export" button is injected directly into the report header, matching the style of existing buttons (Share, Settings).
- **Theme Adaptive:** It automatically adapts to Light and Dark modes by copying computed styles from the interface.
- **Dynamic Visibility:** The button only appears when a report is open.

### 2. Markdown Export (`.md`)
- **One-Click Save:** Uses the modern "Save As" dialog (File System Access API) so you can choose where to save your file.
- **High Fidelity:** Captures the exact Markdown representation from NotebookLM, including tables and nested lists, by leveraging the native copy functionality.


### 3. PDF Export (via Print)
- **Robust Formatting:** Uses `marked.js` to convert the report content into a clean HTML document before printing.
- **Table Support:** Includes a custom parser to correctly handle NotebookLM's "collapsed" tables, ensuring they render as proper grids in the PDF.
- **Enhanced Styling:**
    - **Smart Title Detection:** Automatically detects the report title and formats it as a large, bold H1 header.
    - **Optimized Typography:** Uses a larger 16px body font for readability while maintaining a clean hierarchy for section headings.



## Technical Implementation

### The Solution: Leveraging Native "Copy" with Pre-processing
We leverage NotebookLM's native **"Copy content with formatting"** feature, but with a critical enhancement to ensure correct PDF rendering.

1.  **Programmatic Click:** The extension programmatically clicks the hidden "Copy content with formatting" button.
2.  **Clipboard Interception:** It reads the Markdown content from the system clipboard.
3.  **Pre-processing (`preprocessMarkdown`):**
    *   **Table Fix:** The raw clipboard output often collapses tables into single lines (missing newlines). We implemented a regex-based pre-processor that detects these collapsed tables and inserts the necessary newlines so `marked.js` recognizes them as grids.
    *   **Header Restoration:** We also restore Markdown headers (e.g., converting `1.0 Title` to `## 1.0 Title`) to ensure proper visual hierarchy in the PDF.
4.  **Generation:**
    *   **Markdown:** Saves this enhanced content to a `.md` file.
    *   **PDF:** Passes the clean, pre-processed Markdown to `marked.js` to render a perfectly formatted HTML document for printing.

This hybrid approach combines the clean data from NotebookLM's internal export with our own formatting fixes to guarantee high-quality output.
