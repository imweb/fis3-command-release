var _ = fis.util;
var watch = require('./lib/watch.js');
var release = require('./lib/release.js');
var deploy = require('./lib/deploy.js');
var livereload = require('./lib/livereload.js');
var time = require('./lib/time.js');

exports.name = 'imweb [media name]';
exports.desc = 'build and deploy your project';
exports.options = {
  '-h, --help': 'print this help message',
  '-d, --dest <path>': 'imweb output destination',
  '-l, --lint': 'with lint',
  '-w, --watch': 'monitor the changes of project',
  '-L, --live': 'automatically reload your browser',
  '-c, --clean': 'clean compile cache',
  '-u, --unique': 'use unique compile caching',
  '-r, --root <path>': 'specify project root',
  '-f, --file <filename>': 'specify the file path of `fis-conf.js`',
  '--no-color': 'disable colored output',
  '--verbose': 'enable verbose mode'
};

exports.run = function(argv, cli, env) {

  // 显示帮助信息
  if (argv.h || argv.help) {
    return cli.help(exports.name, exports.options);
  }

  validate(argv);

  // normalize options
  var options = {
    dest: argv.dest || argv.d || 'preview',
    watch: !!(argv.watch || argv.w),
    live: !!(argv.live || argv.L),
    clean: !!(argv.clean || argv.c),
    unique: !!(argv.unique || argv.u),
    useLint: !!(argv.lint || argv.l),
    verbose: !!argv.verbose
  };

  // fis3的lib/cli.js指定当前media的代码有问题，限定了fis3 release命令，此处修复该问题。@vienwu 20151224
  if(argv && argv._ && argv._[1]){
    fis.project.currentMedia(argv._[1]);
  }
  // enable watch automatically when live is enabled.
  options.live && (options.watch = true);

  var app = require('./lib/chains.js')();

  app.use(function(options, next) {

    // clear cache?
    if (options.clean) {
      time(function() {
        fis.cache.clean('compile');
      });
    } else if (env.configPath) {
      // fis-conf 失效？
      var cache = fis.cache(env.configPath, 'conf');
      if(!cache.revert()){
        cache.save();
        time(function() {
          fis.cache.clean('compile');
        });
      }
    }

    next(null, options);
  });

  // watch it?
  options.watch && app.use(watch);
  app.use(release);

  // 处理 livereload 脚本
  app.use(livereload.handleReloadComment);

  // deliver
  app.use(function(info, next) {
    fis.log.debug('deploy start');
    deploy(info, function(error) {
      fis.log.debug('deploy end');
      next(error, info);
    });
  });

  options.live && app.use(livereload.checkReload);

  // run it.
  app.run(options);
};

function validate(argv) {
  if (argv._.length > 2) {
    fis.log.error('Unregconized `%s`, please run `%s imweb --help`', argv._.slice(2).join(' '), fis.cli.name);
  }

  var allowed = ['_', 'dest', 'd', 'lint', 'l', 'watch', 'w', 'live', 'L', 'clean', 'c', 'unique', 'u', 'verbose', 'color', 'root', 'r', 'f', 'file', 'child-flag'];

  Object.keys(argv).forEach(function(k) {
    if (!~allowed.indexOf(k)) {
      fis.log.error('The option `%s` is unregconized, please run `%s imweb --help`', k, fis.cli.name);
    }
  });
}
