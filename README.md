# Battlemake

This is my first use of Gulp, so it's probably terrible.

I created a build system for use with simple projects.  It uses Less.js for
stylesheets, Jade for templates, and Browserify for JavaScript.

# Example usage

    var config = {
    	paths: {
			/* Relative path to output directory */
    		out: 'out'
    	},
    	bundles: {
			/* Client javascript bundle and source-map*/
    		client: 'client.js',
    		clientMap: 'client.json',
			/* Vendor javascript bundle */
    		vendor: 'vendor.js',
			/* Stylesheet */
    		styles: 'style.css'
    	},
    	globs: {
			/* Passed to BROWSERIFY entry point(s) */
    		js: ['./script.js'],
			/* Glob for LESS entry point(s) */
    		less: ['style.less'],
			/* Glob for JADE templates */
    		jade: ['pages/*.jade', 'pages/**/*.jade'],
			/* Glob for NPM files to copy to output folder */
    		npmAssets: ['./node_modules/**/*.@(png|jpg|jpeg|gif|woff|woff2|eot|ttf|otf|svg)']
    	},
		/*
		 * Path to list of Google Webfonts to install
		 * See my battlesnake/gulp-google-webfonts gulp plugin
		 */
    	fonts: 'fonts.list',
		/*
		 * Used to generate vendor script bundle - simply globbing in
		 * node_modules would pull in devDependencies too, which we do not want
		 */
    	dependencies: require('./package.json').dependencies,
		/*
		 * Dependencies which contain no JavaScript, and thus which shouldn't be
		 * added to the vendor bundle
		 */
    	jsFreeDependencies: ['font-awesome'],
		/* Parameters for testing (gulp test) */
    	test: {
			/* Port for test HTTP server to listen on */
    		port: 1234
    	}
    };
    
	/* Generate the build system */
    var battlemake = require('battlemake')(config);

# Modes

`live=1 gulp` - build files for deployment (takes ages), exit afterwards instead
of watching for changes.

`gulp` where `live` is empty or zero - build files for testing (no minification,
much quicker), start watchers to do incremental rebuilds when files change.

`gulp test` - As before, but a connect.js web server is also launched from the
output directory.
