// Helper to create elements
function createElement(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
}

// Function to download content with "Save As" dialog
async function downloadMarkdown(content, defaultFilename) {
    try {
        // Try using the File System Access API
        if ('showSaveFilePicker' in window) {
            const handle = await window.showSaveFilePicker({
                suggestedName: defaultFilename,
                types: [{
                    description: 'Markdown File',
                    accept: { 'text/markdown': ['.md'] },
                }],
            });

            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
            return;
        }
    } catch (err) {
        // Fallback if user cancels or API fails/not supported
        if (err.name !== 'AbortError') {
            console.warn('File System Access API failed, falling back to download.', err);
        } else {
            return; // User cancelled
        }
    }

    // Fallback: Create a Blob and trigger download
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Helper to get content via the "Copy" button
async function getReportContentFromClipboard() {
    // Find the "Copy content with formatting" button
    // It usually has an aria-label or specific icon
    const copyButton = document.querySelector('button[aria-label="Copy content with formatting"]');

    if (!copyButton) {
        throw new Error('Could not find the "Copy content with formatting" button. Please ensure a report is open.');
    }

    // Click it
    copyButton.click();

    // Wait a brief moment for the clipboard to be updated
    await new Promise(resolve => setTimeout(resolve, 300));

    // Read from clipboard
    try {
        const text = await navigator.clipboard.readText();
        return preprocessMarkdown(text);
    } catch (err) {
        console.error('Failed to read clipboard:', err);
        throw new Error('Could not read from clipboard. Please ensure you have granted clipboard permissions.');
    }
}

// Function to pre-process the clipboard markdown to fix formatting issues
function preprocessMarkdown(markdown) {
    if (!markdown) return '';

    let lines = markdown.split('\n');
    let processedLines = [];
    let titleFound = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();

        // 0. Detect Title (First non-empty line)
        if (!titleFound && line.length > 0) {
            // If it doesn't already start with #, make it H1
            if (!line.startsWith('#')) {
                line = `# ${line}`;
            }
            titleFound = true;
            processedLines.push(line);
            continue;
        }

        // 1. Fix Headers
        // NotebookLM copy often gives "1.0 Title" without markdown headers.
        // Heuristic:
        // X.0 Title -> ## Title (H2)
        // X.Y Title -> ### Title (H3)
        // We assume the main title is already handled or is the first line.
        const headerMatch = line.match(/^(\d+)\.(\d+)\s+(.+)$/);
        if (headerMatch) {
            const major = headerMatch[1];
            const minor = headerMatch[2];
            const title = headerMatch[3];

            if (minor === '0') {
                line = `## ${major}.${minor} ${title}`;
            } else {
                line = `### ${major}.${minor} ${title}`;
            }
        }

        // 2. Fix Tables
        // Detect collapsed tables: "Caption | Header | ... | | :--- | ..."
        // We look for the separator pattern "| :---" or "| ---"
        if (line.includes('|') && (line.includes('---') || line.includes(':--'))) {
            // This line likely contains the separator row AND possibly the header row and caption merged.

            // Step A: Split rows based on "| |" pattern
            // This handles "Header | | Separator" -> "Header |\n| Separator"
            let expandedBlock = line.replace(/\|\s+\|/g, '|\n|');

            // Step B: Handle Caption/Header split
            // If the first line of this expanded block doesn't start with a pipe, it might have a caption.
            // e.g. "Table 1: ... | Header ..."
            let blockLines = expandedBlock.split('\n');
            if (blockLines.length > 0 && !blockLines[0].trim().startsWith('|')) {
                const firstPipeIdx = blockLines[0].indexOf('|');
                if (firstPipeIdx > 0) {
                    const caption = blockLines[0].substring(0, firstPipeIdx).trim();
                    const rest = blockLines[0].substring(firstPipeIdx);

                    // Reconstruct: Caption \n\n | Header...
                    // We add a leading pipe to 'rest' if it's missing (it shouldn't be based on split, but good to be safe)
                    // Actually 'rest' starts with '|'.
                    blockLines[0] = `${caption}\n\n${rest}`;
                }
            }

            // Re-join the block and push to processed lines
            processedLines.push(blockLines.join('\n'));
            continue;
        }

        processedLines.push(line);
    }

    return processedLines.join('\n');
}

// Main function to manage the export button
function manageExportButton() {
    // Find the report container to ensure we are in the right context
    const reportContainer = document.querySelector('.artifact-content.artifact-content-scrollable');

    if (!reportContainer) {
        // Report not open, hide wrapper if it exists (though we are moving to injection now)
        const existingWrapper = document.querySelector('.notebooklm-export-wrapper');
        if (existingWrapper) existingWrapper.style.display = 'none';
        return;
    }

    // Find the header to inject into.
    // We look for the close button as a landmark.
    const closeButton = document.querySelector('button[aria-label="Close report viewer"]');

    if (closeButton) {
        const header = closeButton.parentElement;

        // Check if we already injected
        if (header.querySelector('.notebooklm-export-wrapper')) {
            header.querySelector('.notebooklm-export-wrapper').style.display = 'flex';
            return;
        }

        // Create UI
        const wrapper = createExportButtonUI();

        // Adjust wrapper styles for inline injection
        wrapper.style.position = 'static'; // No longer fixed
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.marginLeft = '8px'; // Spacing
        wrapper.style.marginRight = '8px';

        // Insert before the close button or at the end of the header
        // Inserting before close button might be nice.
        header.insertBefore(wrapper, closeButton);
    }
}

function createExportButtonUI() {
    // Create the button with the exact structure of a NotebookLM button
    // Structure: <button class="..."> <span ripple></span> <mat-icon>...</mat-icon> <span label>...</span> ... </button>

    const button = document.createElement('button');
    button.className = 'notebooklm-export-btn mdc-button mat-mdc-button-base mat-tonal-button mat-unthemed';
    // We add our own class 'notebooklm-export-btn' for any specific overrides if needed, 
    // but we try to rely on native classes if they exist (though they might not work if scoped).
    // Since we can't rely on scoped classes working, we will apply the computed styles we found
    // to our own class, but keep the structure.

    // Icon (using a download icon from Google Symbols if available, or SVG)
    // NotebookLM uses font icons. We'll try to use the same font if loaded.
    const icon = document.createElement('mat-icon');
    icon.className = 'mat-icon notranslate mat-icon-rtl-mirror button-icon google-symbols mat-icon-no-color';
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('data-mat-icon-type', 'font');
    icon.textContent = 'download'; // 'download' is a standard Material symbol

    // Label
    const labelSpan = document.createElement('span');
    labelSpan.className = 'mdc-button__label';
    labelSpan.textContent = 'Export';

    button.appendChild(icon);
    button.appendChild(labelSpan);

    const menu = createElement('div', 'notebooklm-export-menu');
    const menuItemMd = createElement('div', 'notebooklm-export-menu-item', 'Markdown (.md)');
    const menuItemPdf = createElement('div', 'notebooklm-export-menu-item', 'PDF (via Print)');

    menu.appendChild(menuItemMd);
    menu.appendChild(menuItemPdf);

    const wrapper = createElement('div', 'notebooklm-export-wrapper');
    wrapper.appendChild(button);
    wrapper.appendChild(menu);

    // Dynamic Styling: Copy styles from the top toolbar buttons
    const topButton = Array.from(document.querySelectorAll('button')).find(b =>
        ['Share', 'Settings', 'Analytics'].includes(b.textContent.trim())
    );

    if (topButton) {
        const computedStyle = window.getComputedStyle(topButton);
        // Apply key structural styles to the button
        button.style.height = computedStyle.height;
        button.style.padding = computedStyle.padding;
        button.style.borderRadius = computedStyle.borderRadius;
        button.style.border = computedStyle.border;
        button.style.backgroundColor = computedStyle.backgroundColor;
        button.style.color = computedStyle.color;
        button.style.fontFamily = computedStyle.fontFamily;
        button.style.fontSize = computedStyle.fontSize;
        button.style.fontWeight = computedStyle.fontWeight;
        button.style.display = 'inline-flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.gap = '8px'; // Add gap for icon/text separation
        button.style.cursor = 'pointer';

        // Hover effects
        button.addEventListener('mouseenter', () => {
            if (computedStyle.color.startsWith('rgb(2')) { // Light text -> Dark mode
                button.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            } else { // Dark text -> Light mode
                button.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
            }
        });
        button.addEventListener('mouseleave', () => {
            button.style.backgroundColor = computedStyle.backgroundColor;
        });
    } else {
        // Fallback styles if no top button found
        button.style.border = '1px solid #5f6368';
        button.style.borderRadius = '100px';
        button.style.padding = '0 16px';
        button.style.height = '32px';
        button.style.backgroundColor = 'transparent';
        button.style.color = 'inherit';
        button.style.display = 'inline-flex';
        button.style.alignItems = 'center';
        button.style.gap = '8px';
    }

    // Event Listeners
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('show');
    });

    document.addEventListener('click', () => {
        menu.classList.remove('show');
    });

    menuItemMd.addEventListener('click', async () => {
        try {
            const markdown = await getReportContentFromClipboard();
            const titleEl = document.querySelector('h1') || document.querySelector('[class*="title"]');
            const title = titleEl ? titleEl.textContent.trim() : 'notebooklm_export';
            const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
            downloadMarkdown(markdown, filename);
        } catch (err) {
            alert(err.message);
        }
    });

    menuItemPdf.addEventListener('click', async () => {
        // 1. Create a print container if it doesn't exist
        let printContainer = document.getElementById('notebooklm-print-container');
        if (printContainer) printContainer.remove();

        printContainer = document.createElement('div');
        printContainer.id = 'notebooklm-print-container';

        try {
            // 2. Get the content via clipboard
            const markdown = await getReportContentFromClipboard();

            // 3. Convert Markdown to HTML using marked.js
            if (typeof marked !== 'undefined') {
                printContainer.innerHTML = marked.parse(markdown);
            } else {
                alert('Marked.js library not found. Cannot generate PDF.');
                return;
            }

            // 4. Append to body
            document.body.appendChild(printContainer);

            // 5. Print
            // Small delay to ensure rendering is complete
            setTimeout(() => {
                window.print();
            }, 100);

        } catch (err) {
            alert(err.message);
        }
    });

    return wrapper;
}

// Initial check
manageExportButton();

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Observe DOM changes with debounce
const observer = new MutationObserver(debounce((mutations) => {
    manageExportButton();
}, 200));

observer.observe(document.body, {
    childList: true,
    subtree: true
});
