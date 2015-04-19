'use strict';

module.exports = generateBuildSystem;

function generateBuildSystem(config) {

var live = isSet('live');
var watching = !live;

var path = require('path');
var assign = require('lodash').assign;
var del = require('del');
var chalk = require('chalk');
var gulp = require('gulp');
var notifier = require('node-notifier');
var util = require('gulp-util');
var gif = require('gulp-if');
var identity = require('gulp-identity');
var plumber = require('gulp-plumber');
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

gulp.task('default', ['build']);

gulp.task('build', ['js', 'css', 'html', 'modules']);

gulp.task('html', ['jade']);
gulp.task('css', ['less']);
gulp.task('js', ['js-vendor', 'js-client']);

gulp.task('test', ['default', 'serve']);

gulp.task('js-vendor', function () {
	return new Browserify({ debug: false })
		.require(dependencies)
		.bundle()
		.pipe(errorHandler())
		.pipe(source(config.bundles.vendor))
		.pipe(gif(live, buffer()))
		.pipe(gif(live, uglify()))
		.pipe(gulp.dest(config.paths.out))
		;
});

gulp.task('js-client', function () {
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
});

gulp.task('jade', function () {
	if (watching) {
		gulp.watch(config.globs.jade, ['jade']);
	}
	return gulp.src(config.globs.jade)
		.pipe(errorHandler())
		.pipe(watchJade())
		.pipe(jade({ pretty: !live }))
		.pipe(gulp.dest(config.paths.out))
		;
});

gulp.task('less', ['webfonts'], function () {
	var opts = { relativeUrls: true };
	if (watching) {
		gulp.watch(config.globs.less, ['less']);
	}
	return gulp.src(config.globs.less)
		.pipe(errorHandler())
		.pipe(watchLess(config.globs.less, opts))
		.pipe(less(opts))
		.pipe(gif(live, minifyCss()))
		.pipe(gulp.dest(config.paths.out))
		;
});

gulp.task('webfonts', function () {
	if (watching) {
		gulp.watch(config.fonts, ['webfonts']);
	}
	return gulp.src(config.fonts)
		.pipe(errorHandler())
		.pipe(fonts())
		.pipe(gulp.dest(config.paths.out))
		;
});

gulp.task('modules', function () {
	return gulp.src(config.globs.npmAssets, { base: './', buffer: false })
		.pipe(errorHandler())
		.pipe(gulp.dest(config.paths.out))
		;
});

gulp.task('lint', function () {
	return gulp.src(['*.js', '**/*.js', '!node_modules/**', '!bower_components/**', '!' + config.paths.out + '/**'])
		.pipe(errorHandler())
		.pipe(jshint())
		.pipe(jshint.reporter(jshintReporter))
		;
});

gulp.task('serve', function () {
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
});

gulp.task('clean', function (cb) {
	del(config.paths.out, cb);
});

}
