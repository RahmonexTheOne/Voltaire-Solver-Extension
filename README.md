# Voltaire-Solver-Extension
Voltaire Solver by Rahmonex" is a powerful web extension designed to enhance your French language experience on the web. Named after the famed French writer and philosopher, Voltaire, this tool empowers users to elevate their writing to new heights of correctness and clarity.

# What does the script do :
Content Script (content-script.js):

-This script is injected into web pages to interact with their content.
-It defines a function debounce that delays the execution of a function until after a specified amount of time has elapsed since the last invocation. This helps prevent overwhelming the LanguageTool API with too many requests.
-There's a function displayCorrection that takes a sentence element, the original text, and an array of corrections. It finds the positions of errors in the text and visually indicates them by inserting "(faute ici)" (error here) at the appropriate locations.
-Another function, checkAndDisplayCorrections, sends the text content of a sentence element to the LanguageTool API for error checking. If errors are found, it calls displayCorrection to visually mark them.
-The script also sets up a MutationObserver to watch for changes in the DOM, particularly for the addition of new sentence elements. When new sentences are added, it triggers the error checking process.

Manifest (manifest.json):

-It defines the metadata and permissions for the extension.
-The extension is given permission to access active tabs and to make requests to the LanguageTool API.
-It specifies a background script (background.js) to handle browser action events.
-Content scripts are specified to run on all URLs, and they include content-script.js.
-Icons for the extension are provided in various sizes.

Background Script (background.js):

-It listens for clicks on the extension's icon and executes the content script (content-script.js) in the active tab when clicked.
