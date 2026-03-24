# Dynamic Custom Artefacts

Openclaw agents will be instructed to create temporary dynamic artefacts. Agents will send links to these artefacts that can be viewed as static SPA apps.


## SPA app rules

* No build/compilation, static HTML with CSS and Javascript as separate files (or inline, when small). 
* Data is inline or as JSON files that can be loaded via XHR.
* Each artefact is available under URL like /artefact/{artefact.id}
* Artefacts can be private (default), shared with other hub users or private 