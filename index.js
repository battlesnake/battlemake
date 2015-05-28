'use strict';

module.exports = generateBuildSystem;

function generateBuildSystem(config) {

var gulp = require('gulp');

gulp.task('default', ['test']);
gulp.task('build', ['js', 'css', 'html']);
gulp.task('rebuild', rebuildTask);
gulp.task('html', ['jade']);
gulp.task('css', ['less']);
gulp.task('js', ['js-vendor', 'js-client']);
gulp.task('test', ['rebuild', 'serve']);
gulp.task('js-vendor', jsVendorTask);
gulp.task('js-client', jsClientTask);
gulp.task('jade', jadeTask);
gulp.task('less', ['webfonts', 'modules'], lessTask);
gulp.task('webfonts', webfontsTask);
gulp.task('modules', modulesTask);
gulp.task('lint', lintTask);
gulp.task('serve', serveTask);
gulp.task('clean', cleanTask);

var live = isSet('live');
var watching = !live;

var path = require('path');
var assign = require('lodash').assign;
var del = require('del');
var chalk = require('chalk');
var notifier = require('node-notifier');
var util = require('gulp-util');
var gif = require('gulp-if');
var identity = require('gulp-identity');
var plumber = require('gulp-plumber');
var series = require('run-sequence');
var sourcemaps = require('gulp-sourcemaps');
var Browserify = require('browserify');
var debowerify = require('debowerify');
var deamdify = require('deamdify');
var jshint = require('gulp-jshint');
var jshintReporter = require('jshint-stylish-source');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var envify = require('envify');
var uglify = require('gulp-uglify');
var minifyify = require('minifyify');
var ngAnnotate = require('browserify-ngannotate');
var less = require('gulp-less');
var minifyCss = require('gulp-minify-css');
var base64 = require('gulp-base64');
var jade = require('gulp-jade');
var fonts = require('gulp-google-webfonts');
var rename = require('gulp-rename');
var watch = watching ? require('gulp-watch') : gulp.src.bind(gulp);
var watchify = watching ? require('watchify') : function (brows) { return brows; };
var watchLess = watching ? require('gulp-watch-less') : identity;
var watchJade = watching ? require('gulp-jade-find-affected') : identity;

function isSet(name) {
	return ["", "0", "false", "no"].indexOf(process.env[name] || '') === -1;
}

var errorReporter = function (error) {
	error = String(error);
	util.log(chalk.yellow(error));
	notifier.notify({ title: 'Build failed', message: error });
};

var errorHandler = function () {
	return plumber({ errorHandler: errorReporter });
};

/* Dependencies for vendor bundle */
var dependencies = Object.keys(config.dependencies)
	.filter(function (name) {
		return !config.jsFreeDependencies ||
			config.jsFreeDependencies.indexOf(name) === -1;
	})
	.sort();

function rebuildTask(cb) {
	series('clean', 'build', cb);
}

function jsVendorTask() {
	return new Browserify({ debug: false })
		.require(dependencies)
		.bundle()
		.pipe(errorHandler())
		.pipe(source(config.bundles.vendor))
		.pipe(gif(live, buffer()))
		.pipe(gif(live, uglify()))
		.pipe(gulp.dest(config.paths.out))
		;
}

function jsClientTask() {
	/* Only minify client bundle if doing build for live */
	var minifyifyConditional = live ? minifyify : function (a) { return a; };

	var opts = {
		entries: config.globs.js,
		debug: true,
		fullPaths: true
	};
	opts = assign(opts, watchify.args);

	/* Client bundle configuration */
	var bundler = new Browserify(opts)
		.external(dependencies)
		.transform(envify)
		.transform(ngAnnotate)
		.transform(debowerify)
		.transform(deamdify)
		.plugin(minifyifyConditional, {
			map: config.bundles.clientMap,
			output: path.join(config.paths.out, config.bundles.clientMap)
		})
		;

	bundler = watchify(bundler, { poll: 300, delay: 300 })
		.on('update', onUpdate)
		.on('time', onUpdateComplete)
		;

	return onUpdate();

	function onUpdate(ids) {
		util.log('Browserifying' + (ids ? ': ' + ids.map(function (s) { return chalk.cyan(s); }).join(', ') : '...'));
		return bundler
			.bundle()
			.on('error', onError)
			.pipe(source(config.bundles.client))
			.pipe(buffer())
			.pipe(sourcemaps.init({ loadMaps: true }))
			.pipe(sourcemaps.write('./'))
			.pipe(gulp.dest(config.paths.out))
			;
	}

	function onUpdateComplete(time) {
		util.log(chalk.underline('Browserified in ' + chalk.magenta(time) + ' ms'));
	}

	function onError(err) {
		errorReporter(err);
	}
}

function jadeTask() {
	if (watching) {
		gulp.watch(config.globs.jade, ['jade']);
	}
	return gulp.src(config.globs.jade)
		.pipe(errorHandler())
		.pipe(watchJade())
		.pipe(jade({ pretty: !live, locals: config.jadeContext }))
		.pipe(gulp.dest(config.paths.out))
		;
}

function lessTask() {
	var opts = { relativeUrls: true };
	if (watching) {
		gulp.watch(config.globs.less, ['less']);
	}
	var base64opts = {
		debug: false,
		extensions: config.base64.includeExtensions,
		maxImageSize: config.base64.maxImageSize
	};
	return gulp.src(config.globs.less)
		.pipe(errorHandler())
		.pipe(watchLess(config.globs.less, { name: 'LESS', less: opts }, onChange))
		.pipe(less(opts))
		.pipe(gif(config.base64.enabled, base64(base64opts)))
		.pipe(gif(live, minifyCss()))
		.pipe(rename(config.bundles.styles))
		.pipe(gulp.dest(config.paths.out))
		;

	function onChange(events, done) {
		done();
		process.nextTick(lessTask);
	}
}

function webfontsTask() {
	if (watching) {
		gulp.watch(config.fonts, ['webfonts']);
	}
	return gulp.src(config.fonts)
		.pipe(errorHandler())
		.pipe(fonts())
		.pipe(gulp.dest(config.paths.out))
		;
}

function modulesTask() {
	return gulp.src(config.globs.npmAssets, { base: './', buffer: false })
		.pipe(errorHandler())
		.pipe(gulp.dest(config.paths.out))
		;
}

function lintTask() {
	return gulp.src(['*.js', '**/*.js', '!node_modules/**', '!bower_components/**', '!' + config.paths.out + '/**'])
		.pipe(errorHandler())
		.pipe(jshint())
		.pipe(jshint.reporter(jshintReporter))
		;
}

function serveTask() {
	var http = require('http');
	var connect = require('connect');
	var compression = require('compression');
	var serveStatic = require('serve-static');
	var app = connect();
	app.use(compression());
	app.use(serveStatic(config.paths.out));
	util.log('Starting HTTP server on port ' + chalk.cyan(config.test.port));
	http.createServer(app)
		.listen(config.test.port);
}

function cleanTask(cb) {
	del(config.paths.out, cb);
}

}
