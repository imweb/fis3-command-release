var checkIgnore = require('./checkignore.js');
var _ = fis.util;
var chokidar = require('chokidar');
var util = require('util');
var path = require('path');

var patterns, root;

function isMaster() {
  var argv = process.argv;
  return !~argv.indexOf('--child-flag');
}

// 判断新加的文件是否满足用户指定。
function match(path) {

  if (!patterns) {
    patterns = fis.media().get('project.files', []);

    if (!Array.isArray(patterns)) {
      patterns = [patterns];
    }

    patterns = patterns.map(function(pattern) {
      var negate = false;

      if (pattern[0] === '!') {
        negate = true;
        pattern = pattern.substring(1);
      }

      pattern[0] === '/' && (pattern = pattern.substring(1));

      return {
        negate: negate,
        reg: _.glob(pattern)
      };
    });
  }

  path.indexOf(root) === 0 && (path = path.substring(root.length));

  var hitted = false;
  patterns.forEach(function(item) {
    if (hitted) {
      if (item.negate && item.reg.test(path)) {
        hitted = false;
      }
    } else {
      hitted = item.negate !== item.reg.test(path);
    }
  });

  return hitted;
}

var child_process = require('child_process');

// 当监听到 fis-conf.js 文件变化的时候，kill self 重启一个新进程。
function respawn() {
  var argv = process.argv;
  var child = child_process.spawn(argv[0], argv.slice(1).concat('--child-flag'));
  child.stderr.pipe(process.stderr);
  child.stdout.on('data', function(data) {
    if (~data.toString('utf-8').indexOf('Currently running fis3')) {
      return;
    }
    process.stdout.write(data);
  });
  child.on('exit', function(code, signal) {
    process.on('exit', function() {
      if (signal) {
        process.kill(process.pid, signal);
      } else {
        process.exit(code);
      }
    });
  });
  return child;
}

function onFisConfChange() {
  var argv = process.argv.slice(3);
  argv.pop();
  fis.log.info('Detect `fis-conf.js` modified, respawn `%s imweb %s`.', fis.cli.name, argv.join(' '));
  process.exit();
}

var watcher;
var watchList = [];

function watch(options, next) {
  // 用子进程去 watch.
  if (isMaster()) {
    return (function() {
      var damen = arguments.callee;
      var child = respawn();

      child.on('exit', function(code) {
        code || damen();
      });
    })();
  }

  root = fis.project.getProjectPath();

  var opts = {
    usePolling: false,
    persistent: true,
    ignoreInitial: true,
    followSymlinks: false,
    ignored: function(filepath) {

      // normalize filepath
      filepath = filepath.replace(/\\/g, '/');
      filepath.indexOf(root) === 0 && (filepath = filepath.substring(root.length));

      // todo 暂时不支持 -f 参数指定其他配置文件。
      if (filepath === '/fis-conf.js') {
        return false;
      }

      return checkIgnore(filepath);
    }
  };

  _.assign(opts, fis.get('project.watch', {}));

  var busy = false;
  var timer;

  function done(error, ret) {
    busy = false;

    if (!error) {

      // 将所有相关的文件，都加入 watchList
      Object.keys(ret.modified).forEach(function(filepath) {
        var file = ret.modified[filepath];

        filepath = fis.util(root, filepath);
        ~watchList.indexOf(filepath) || watchList.push(filepath);

        file.links.forEach(function(filepath) {
          filepath = fis.util(root, filepath);
          ~watchList.indexOf(filepath) || watchList.push(filepath);
        });

        if (file.cache) {
          _.forEach(file.cache.deps, function(mtime, filepath) {
            ~watchList.indexOf(filepath) || watchList.push(filepath);
          });
        }
      });

      process.stdout.write(util.format(' [%s]\n'.grey, fis.log.now()))
    }
  }

  var files = fis.project.getSource();
  options.srcCache = options.srcCache || [];
  fis.util.map(files, function(subpath, file) {
    options.srcCache.push(file.realpath);
  });

  // 处理watch ------- start vienwu 20151208
  options.__srcCache = options.srcCache;
  options.__files = {};
    // 根据id获取路径
    function getIdByPath(_path) {
        var _file = options.__files[_path];
        return _file ? _file.id : '';
        return '';
    }
    // 获取引用了该id的所有文件
    function getRefs(_path) {
        var refs = [],
            file = options.__files[_path],
            key,
            tmpFile;
        if(file){
            for(key in options.__files){
                tmpFile = options.__files[key];
                if(~tmpFile.requires.indexOf(file.id)){
                    ~refs.indexOf(key) || refs.push(key);
                }
                if(~tmpFile.links.indexOf(file.subpath)){
                    ~refs.indexOf(key) || refs.push(key);
                }
            }
        }else{
            // 没有找到文件，可能是_xx.scss或其他没有参与release的文件，缓存中不存在
            // 但watch时需要找到有哪些文件需要重新编译
            file = fis.file(_path);
            for(key in options.__files){
                tmpFile = options.__files[key];
                if(tmpFile.scssLinks && ~tmpFile.scssLinks.indexOf(file.subpath)){
                    ~refs.indexOf(key) || refs.push(key);
                }
            }
        }
        return refs;
    }
  // 处理watch -------- end

  var safePathReg = /[\\\/][_\-.\s\w]+$/i;

  function listener(type) {
    return function(path) {

      if (path && safePathReg.test(path)) {
        var modified = false;

        path = fis.util(path);

        if (path === root + '/fis-conf.js') {
          return onFisConfChange();
        }

        fis.log.debug('Watch Event %s, path: %s', type, path);

        if (~watchList.indexOf(path)) {
          modified = true;
        }
        if(type === 'change'){
          // 只重新编译相关的文件。 --- vienwu 20151208
          options.srcCache = getRefs(path).concat(path);
            console.log('change',path,options.srcCache);
        } else if(type === 'add'){
            console.log('add',path);
          options.srcCache = options.__srcCache;

          // 新增文件，全部重新编译
          ~options.srcCache.indexOf(path) || match(path) &&
            (options.srcCache.push(path), modified = true);

        } else if (type === 'unlink') {
          var idx = watchList.indexOf(path);

          if (~idx) {
            watchList.splice(idx, 1);
            modified = true;
          }

          idx = options.srcCache.indexOf(path);

          if (~idx) {
            options.srcCache.splice(idx, 1);
            modified = true;
          }
        } else if (type === 'unlinkDir') {
          var toDelete = [];

          watchList.forEach(function(realpath, index) {
            if (realpath.indexOf(path) === 0) {
              toDelete.unshift(index);
            }
          });

          toDelete.forEach(function(index) {
            watchList.splice(index, 1);
            modified = true;
          });

          toDelete = [];
          options.srcCache.forEach(function(realpath, index) {
            if (realpath.indexOf(path) === 0) {
              toDelete.unshift(index);
            }
          });

          toDelete.forEach(function(index) {
            options.srcCache.splice(index, 1);
            modified = true;
          });
        }

        // Nothing happend!
        if (!modified) {
          return;
        }
      }

      if (busy) return;

      if (type === 'inital') {
        busy = true;
        next(null, options, done);
      } else {
        clearTimeout(timer);
        timer = setTimeout(function() {
          busy = true;
          next(null, options, done);
        }, 200);
      }
    }
  }

  watcher = chokidar
    .watch(root, opts)
    .on('add', listener('add'))
    .on('change', listener('change'))
    .on('unlink', listener('unlink'))
    .on('unlinkDir', listener('unlinkDir'))
    .on('error', function(err) {
      err.message += fis.cli.colors.red('\n\tYou can set `fis.config.set("project.watch.usePolling", true)` fix it.');
      fis.log.error(err);
    });
  console.log('watched.',root);
  opts.ignoreInitial && listener('inital')();
}

module.exports = watch;
