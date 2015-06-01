'use strict';

module.exports = generateBuildSystem;

// Until issue #538 in less is resolved
function patchLess() {
	var less = require('less');
	var Funcplug = require('less-plugin-functions') ;
	var oldRender = less.render;
	less.render = function () {
		var args = [].slice.apply(arguments);
		if (args.length < 2) {
			args.push({});
		}
		var options = args[1];
		options.plugins = options.plugins || [];
		options.plugins.unshift(new Funcplug({}));
		return oldRender.apply(less, args);
	};
}

function generateBuildSystem(config) {

patchLess();

var gulp = require('gulp');

var buildTasks = ['js', 'css', 'html'].concat(config.extraTasks || []);

gulp.task('default', ['test']);
gulp.task('build', buildTasks);
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
var ignore = require('gulp-ignore');
var identity = require('gulp-identity');
var plumber = require('gulp-plumber');
var series = require('run-sequence');
var sourcemaps = require('gulp-sourcemaps');
var Browserify = require('browserify');
var debowerify = require('debowerify');
var deamdify = require('deamdify');
var strictify = require('strictify');
var jshint = require('gulp-jshint');
var jshintReporter = require('jshint-stylish-source');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var envify = require('envify');
var uglify = require('gulp-uglify');
var minifyify = require('minifyify');
var autoprefix = require('gulp-autoprefixer');
var ngAnnotate = require('browserify-ngannotate');
var less = require('gulp-less');
var minifyCss = require('gulp-minify-css');
var base64 = require('gulp-base64');
var jade = require('gulp-jade');
var fonts = require('gulp-google-webfonts');
var concat = require('gulp-concat');
var data = require('gulp-data');
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
	if (this && this.emit) {
		this.emit('end');
	}
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

var jsClientWatch;
function jsClientTask() {
	var toWatch = config.globs.jsClientDeps || [];
	if (watching) {
		jsClientWatch = jsClientWatch ||
			gulp.watch(toWatch, ['js-client'])
				.on('error', errorReporter);
	}

	/* Only minify client bundle if doing build for live */
	var minifyifyConditional = live ? minifyify : function (a) { return a; };

	var opts = {
		entries: config.globs.js,
		debug: true,
		fullPaths: true
	};
//	opts = assign(opts, watchify.args);

	return new Browserify(opts)
		.external(dependencies)
		.transform(envify)
		.transform(strictify)
		.transform(ngAnnotate)
		.transform(debowerify)
		.transform(deamdify)
		.plugin(minifyifyConditional, {
			map: config.bundles.clientMap,
			output: path.join(config.paths.out, config.bundles.clientMap)
		})
		.bundle()
		.on('error', errorReporter)
		.pipe(source(config.bundles.client))
		.pipe(buffer())
		.pipe(sourcemaps.init({ loadMaps: true }))
		.pipe(sourcemaps.write('./'))
		.pipe(gulp.dest(config.paths.out))
		;

	/* Client bundle configuration */
//	var bundler = new Browserify(opts)
//		.external(dependencies)
//		.transform(envify)
//		.transform(strictify)
//		.transform(ngAnnotate)
//		.transform(debowerify)
//		.transform(deamdify)
//		.plugin(minifyifyConditional, {
//			map: config.bundles.clientMap,
//			output: path.join(config.paths.out, config.bundles.clientMap)
//		})
//		;
//
//	bundler = watchify(bundler, { poll: 300, delay: 300 })
//		.on('update', onUpdate)
//		.on('time', onUpdateComplete)
//		;
//
//	return onUpdate();
//
//	function onUpdate(ids) {
//		util.log('Browserifying' + (ids ? ': ' + ids.map(function (s) { return chalk.cyan(s); }).join(', ') : '...'));
//		return bundler
//			.bundle()
//			.on('error', onError)
//			.pipe(source(config.bundles.client))
//			.pipe(buffer())
//			.pipe(sourcemaps.init({ loadMaps: true }))
//			.pipe(sourcemaps.write('./'))
//			.pipe(gulp.dest(config.paths.out))
//			;
//	}
//
//	function onUpdateComplete(time) {
//		util.log(chalk.underline('Browserified in ' + chalk.magenta(time) + ' ms'));
//	}
//
//	function onError(err) {
//		errorReporter(err);
//	}
}

var jadeWatch;
function jadeTask() {
	var toWatch = (config.globs.jadeDeps || []).concat(config.globs.jade);
	if (watching) {
		jadeWatch = jadeWatch ||
			gulp.watch(toWatch, ['jade'])
				.on('error', errorReporter);
	}
	var dataGetter =
		(config.jadeContext instanceof Function) ? data(config.jadeContext) :
		(config.jadeContext !== undefined) ? data(function (file) { return config.jadeContext; }) :
		identity();
	return gulp.src(config.globs.jade)
		.pipe(errorHandler())
//		.pipe(watchJade())
		.pipe(dataGetter)
		.pipe(jade({ pretty: !live }))
		.pipe(gulp.dest(config.paths.out))
		;
}

var lessWatch;
function lessTask() {
	var opts = { relativeUrls: true, strictUnits: true, strictMath: true };
	var toWatch = (config.globs.lessDeps || []).concat(config.globs.less);
	if (watching) {
		lessWatch = lessWatch ||
			gulp.watch(toWatch, ['less'])
				.on('error', errorReporter);
	}
	var base64opts = {
		debug: false,
		extensions: config.base64.includeExtensions,
		maxImageSize: config.base64.maxImageSize
	};
	var prefixer = autoprefix({ browsers: ['last 2 versions'], cascade: false });
	return gulp.src(config.globs.less)
		.pipe(errorHandler())
//		.pipe(watchLess(toWatch, { name: 'LESS', less: opts }))
		.pipe(sourcemaps.init())
		.pipe(less(opts))
		.pipe(gif(config.base64.enabled, base64(base64opts)))
		.pipe(gif(live, prefixer))
		.pipe(gif(live, minifyCss()))
		.pipe(concat(config.bundles.styles))
		.pipe(sourcemaps.write('.'))
		.pipe(gulp.dest(config.paths.out))
		;
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
	var exclude = config.globs.npmAssetsExclude ? ignore.exclude(config.globs.npmAssetsExclude) : identity;
	return gulp.src(config.globs.npmAssets, { base: './', buffer: false })
		.pipe(exclude)
		.pipe(errorHandler())
		.pipe(gulp.dest(config.paths.out))
		;
}

function lintTask() {
	var exclude = config.globs.lineExclude ? ignore.exclude(config.globs.lintExclude) : identity;
	return gulp.src(['*.js', '**/*.js', '!node_modules/**', '!bower_components/**', '!' + config.paths.out + '/**'])
		.pipe(exclude)
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
