/*
	View module
*/
define(
[
	'jquery',
	'mustache',
	'text!./View.html', // the View's main HTML template, rendered immediately, defines the view's outer HTML structure
	'text!./data.html', // template to use to render data loaded after initialization
	'cssx/css!./View.css' // CSS for the View, defines its OOCSS initial state
],
function($, mustache, template, dataTemplate) {
	
	var initialState = 'module-initializing';
	
	function View(node) {
		// Generate view template
		$(node).html(mustache(template));

		// Grab module top-level node
		this._node = $('.view-module', node);
				
		// Cache content node.  We'll insert content from data in render()
		this._content = $('.view-module-content', this._node);
	}
	
	View.prototype = {
		reset: function reset() {
			// Return to the initial state, and clear the content
			this._node.addClass(initialState);
			this._content.empty();
		},
		
		render: function render(data) {
			// Render data, then exit initial state
			this._content.html(mustache(dataTemplate, data));
			this._node.removeClass(initialState);
		}
	};
	
	return View;
});
