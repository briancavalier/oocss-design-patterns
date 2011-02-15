/**
 * Copyright (c) 2010 unscriptable.com
 */

/*jslint browser:true, on:true, sub:true */

(function () {
"use strict";

/*
 * RequireJS css! plugin
 * This plugin will load and wait for css files.  This could be handy when
 * loading css files as part of a layer or as a way to apply a run-time theme.
 * Most browsers do not support the load event handler of the link element.
 * Therefore, we have to use other means to detect when a css file loads.
 * (The HTML5 spec states that the LINK element should have a load event, but
 * not even Chrome 8 or FF4b7 have it, yet.
 * http://www.w3.org/TR/html5/semantics.html#the-link-element)
 *
 * This plugin tries to use the load event and a universal work-around when
 * it is invoked the first time.  If the load event works, it is used on
 * every successive load.  Therefore, browsers that support the load event will
 * just work (i.e. no need for hacks!).  FYI, Feature-detecting the load
 * event is tricky since most borwsers have a non-functional onload property.
 *
 * The universal work-around watches a stylesheet until its rules are
 * available (not null or undefined).  There are nuances, of course, between
 * the various browsers.  The isLinkReady function accounts for these.
 *
 * Note: it appears that all browsers load @import'ed stylesheets before
 * fully processing the rest of the importing stylesheet. Therefore, we
 * don't need to find and wait for any @import rules explicitly.
 *
 * Note #2: for Chrome compatibility, stylesheets must have at least one rule.
 * AFAIK, there's no way to tell the difference between an empty sheet and
 * one that isn't finished loading in Chrome (XD or same-domain).
 *
 * Options:
 *      !nowait - does not wait for the stylesheet to be parsed, just loads it
 *
 * Global configuration options:
 *
 * cssDeferLoad: Boolean. You can also instruct this plugin to not wait
 * for css resources. They'll get loaded asap, but other code won't wait
 * for them. This is just like using the !nowait option on every css file.
 *
 * cssWatchPeriod: if direct load-detection techniques fail, this option
 * determines the msec to wait between brute-force checks for rules. The
 * default is 50 msec.
 *
 * You may specify an alternate file extension:
 *      require('css!myproj/component.less') // --> myproj/component.less
 *      require('css!myproj/component.scss') // --> myproj/component.scss
 *
 * When using alternative file extensions, be sure to serve the files from
 * the server with the correct mime type (text/css) or some browsers won't
 * parse them, causing an error in the plugin.
 *
 * usage:
 *      require('css!myproj/comp'); // load and wait for myproj/comp.css
 *      define(['css!some/folder/file'], {}); // wait for some/folder/file.css
 *      require('css!myWidget!nowait');
 *
 * Tested in:
 *      Firefox 1.5, 2.0, 3.0, 3.5, 3.6, and 4.0b6
 *      Safari 3.0.4, 3.2.1, 5.0
 *      Chrome 7 (8 is partly b0rked)
 *      Opera 9.52, 10.63, and Opera 11.00
 *      IE 6, 7, and 8
 *      Netscape 7.2 (WTF? SRSLY!)
 * Does not work in Safari 2.x :(
 * In Chrome 8, there's no way to wait for cross-domain (XD) stylesheets.
 * See comments in the code below.
 * TODO: figure out how to be forward-compatible when browsers support HTML5's
 *  load handler without breaking IE and Opera
*/


var
	// compressibility shortcuts
	orsc = 'onreadystatechange',
	ol = 'onload',
	ce = 'createElement',
	// failed is true if RequireJS threw an exception
	failed = false,
	undef;

// failure detection:
require.onError = (function (orig) {
	return function () {
		failed = true;
		orig.apply(this, arguments);
	}
})(require.onError);

/***** load-detection functions *****/

function loadHandler (params, cb) {
	// We're using 'readystatechange' because webkit falsely reports it supports
	// the 'load' event. IE and Opera happily support either.
	// FF? none of the above.  See the loadDetector function for more info.
	var link = params.link;
	link[orsc] = link[ol] = function () {
		if (!link.readyState || link.readyState == 'complete') {
				link[orsc] = link[ol] = null;
				cb();
		}
	};
}

function findDoc () {
	return window['document'];
}

function findHead (doc) {
	// Finds the HEAD element (or the BODY element if the head wasn't
	// found).
	//  doc: DOMDocument (optional) Searches the supplied document,
	// or the currently-scoped window.document if omitted.
	var node = (doc || findDoc()).documentElement.firstChild;
	while (node && (node.nodeType != 1 || !/head|body/i.test(node.tagName))) {
		node = node.nextSibling;
	}
	return node;
}

function nameWithExt (name, defaultExt) {
	return name.lastIndexOf('.') <= name.lastIndexOf('/') ?
		name + '.' + defaultExt : name;
}

function parseSuffixes (name) {
	// creates a dual-structure: both an array and a hashmap
	// suffixes[0] is the actual name
	var parts = name.split('!'),
		suf, i = 1, pair;
	while ((suf = parts[i++])) { // double-parens to avoid jslint griping
		pair = suf.split('=', 2);
		parts[pair[0]] = pair.length == 2 ? pair[1] : true;
	}
	return parts;
}

function createLink (doc, optHref) {
	var link = (doc || findDoc())[ce]('link');
	link.rel = "stylesheet";
	link.type = "text/css";
	if (optHref) {
		link.href = optHref;
	}
	return link;
}

function hasEvent (tag, event) {
    // Detects if an event is supported on an element by
    // checking if an event handler function was created.
    // Note: Does not work in IE6-8. Only good for other browsers.
    // This uses a bastardization of @kangax's method:
    // http://perfectionkills.com/detecting-event-support-without-browser-sniffing/
    // (Thanks to @bstakes for the heads up!)
    var handler = 'on' + event,
        el = findDoc()[ce](tag),
        has = handler in el;
    el.setAttribute(handler, 'return;');
    return has && typeof el[handler] == 'function';
}

// Chrome 8 hax0rs!
// This is an ugly hack needed by Chrome 8 which no longer waits for rules
// to be applied the the document before exposing them to javascript.
// Unfortunately, this routine will never fire for XD stylsheets since
// Chrome will also throw an exception if attempting to access the rules
// of an XD stylesheet.  Therefore, there's no way to detect the load
// event of XD stylesheets until Google fixes this, preferably with a
// functional load event!  As a work-around, use ready() before rendering
// widgets / components that need the css to be ready.
var testEl;
function styleIsApplied () {
	var doc = findDoc();
	if (!testEl) {
		testEl = doc[ce]('div');
		testEl.id = '_cssx_load_test';
		testEl.style.cssText = 'position:absolute;top:-999px;left:-999px;';
		doc.body.appendChild(testEl);
	}
	return doc.defaultView.getComputedStyle(testEl, null).marginTop == '-5px';
}

function isLinkReady (link) {
    // This routine is a bit fragile: browser vendors seem oblivious to
	// the need to know precisely when stylesheets load.  Therefore, we need
	// to continually test beta browsers until they all support the LINK load
	// event like IE and Opera.
    var sheet, rules, ready = false;
    try {
        // webkit's and IE's sheet is null until the sheet is loaded
        sheet = link.sheet || link.styleSheet;
        // mozilla's sheet throws an exception if trying to access xd rules
        rules = sheet.cssRules || sheet.rules;
        // webkit's xd sheet returns rules == null
        // opera's sheet always returns rules, but length is zero until loaded
        // friggin IE doesn't count @import rules as rules, but IE should
	    // never hit this routine anyways.
        ready = rules ?
            rules.length > 0 : // || (sheet.imports && sheet.imports.length > 0) :
            rules !== undef;
	    // thanks, Chrome 8, for this lovely hack
	    if (ready && navigator.userAgent.indexOf('Chrome') >= 0) {
		    sheet.insertRule('#_cssx_load_test{margin-top:-5px;}', 0);
		    ready = styleIsApplied();
		    sheet.deleteRule(0);
	    }
    }
    catch (ex) {
        // 1000 means FF loaded an xd stylesheet
        // other browsers just throw a security error here (IE uses the phrase 'Access is denied')
        ready = (ex.code == 1000) || (ex.message.match(/security|denied/i));
    }
    return ready;
}

function ssWatcher (params, cb) {
    // watches a stylesheet for loading signs.
    if (isLinkReady(params.link)) {
        cb();
    }
    else if (!failed) {
        // If RequireJS didn't timeout, try again in a bit:
        setTimeout(function () { ssWatcher(params, cb); }, params.wait);
    }
}

function loadDetector (params, cb) {
    // When this function figures out which load detector works, it overwrites
    // itself to use that function every time. It would be nice to use
    // onload everywhere, but FF4b7 doesn't support it (even though it'll
    // pass kangax's test (see hasEvent method for more info),
    // and webkit doesn't support it (even though it has an 'onload'
    // property). The onload handler only works in IE and Opera.
    // Detecting it cross-browser is completely impossible, but the
    // hasEvent method detects it in Opera and should detect it
    // in future browsers (hopefully).

    if (orsc in params.link || hasEvent('link', 'load')) {
        (loadDetector = loadHandler)(params, cb); // intentional function assignment, FU jslint
    }
    else {
        (loadDetector = ssWatcher)(params, cb); // intentional function assignment, FU jslint
    }

}

/***** finally! the actual plugin *****/

var plugin = {

		//prefix: 'css',

		load: function (resourceDef, require, callback, config) {

			var
				// TODO: this is a bit weird: find a better way to extract name?
				opts = plugin.parseSuffixes(resourceDef),
				name = opts.shift(),
				nameWithExt = plugin.nameWithExt(name, 'css'),
				url = require.toUrl(nameWithExt),
				doc = plugin.findDoc(),
				head = plugin.findHead(doc),
				link = plugin.createLink(doc),
				nowait = 'nowait' in opts ? opts.nowait != 'false' : !!config.cssDeferLoad,
				params = {
					doc: doc,
					head: head,
					link: link,
					url: url,
					wait: config.cssWatchPeriod || 50
				};

			// all detector functions must ensure that this function only gets
			// called once per stylesheet!
			function loaded () {
				// load/error handler may have executed before stylesheet is
				// fully parsed / processed in Opera, so use setTimeout.
				// Opera will process before the it next enters the event loop
				// (so 0 msec is enough time).
				setTimeout(function () { callback(link); }, 0);
			}

			if (nowait) {
				callback(link);
			}
			else {
				// hook up load detector(s)
				loadDetector(params, loaded);
			}

			// go!
			link.href = url;
			head.appendChild(link);

		},

		/* the following methods are public in case they're useful to other plugins */

		findDoc: findDoc,

		findHead: findHead,

		nameWithExt: nameWithExt,

		parseSuffixes: parseSuffixes,

		createLink: createLink

	};

define(plugin);

})();
