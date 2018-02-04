const gulp = require('gulp');
const ts = require('gulp-typescript');
const jasmine = require('gulp-jasmine');
const clean = require('gulp-clean');
const runSequence = require('run-sequence');
const spawn = require('child_process').spawn;

let node;

gulp.task('build', function () {
    const tsProject = ts.createProject('tsconfig.json');

    let tsResult = tsProject.src().pipe(tsProject());

    let outDir = tsProject.config.compilerOptions.outDir;

    gulp.src(['./src/**/*.json', './src/**/*.html', './src/**/*.js', './src/**/*.css']).pipe(gulp.dest(outDir + '\\src'));

    return tsResult.js.pipe(gulp.dest(outDir));
});

gulp.task('clean', function () {
    return gulp.src('dist', {read: false}).pipe(clean());
});

gulp.task('test:run', function () {
    return gulp.src('dist/**/spec/**/*').pipe(jasmine())
});

gulp.task('test', [], function (cb) {
    runSequence('clean', 'build', 'test:run', cb);
});

gulp.task('server', function () {
    if (node) node.kill();
    runSequence('clean', 'build', function () {
        node = spawn('node', ['dist/src/index.js'], {stdio: 'inherit'});
        node.on('close', function (code) {
            if (code === 8) {
                gulp.log('Error detected, waiting for changes...');
            }
        });
    });
});

gulp.task('default', ['server'], function () {
    gulp.watch(['src/**/*'], ['server']);
});