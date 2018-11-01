
// TODO: We could use the new Node 11 workers via
// node --experimental-worker test/all.js 
// Then we could: 
//const { Worker } = require('worker_threads');
// But it turns out that the worker_threads interface is just different enough not to work. 
// Something like tiny-worker should be a wrapper around the node interface if it's available
var Worker = require("tiny-worker");
var path = require("path");

exports.test = function(notUsed, assert, done) {
  var target = process.argv[2];
  var file = target ? "sql-"+target : "sql";
  // If we use tiny-worker, we need to pass in this new cwd as the root of the file being loaded:
  var worker = new Worker(path.join(__dirname, "../js/worker."+file+".js"), null, { cwd: path.join(__dirname, "../js/") });
  
  // The following tests are continually overwriting worker.onmessage so that they 

  worker.onmessage = function(event) {
    var data = event.data;
    assert.strictEqual(data.id, 1, "Return the given id in the correct format");
    assert.deepEqual(data, {id:1, ready:true}, 'Correct data answered to the "open" query');

    worker.onmessage = function(event) {
      var data = event.data;
      assert.strictEqual(data.id, 2, "Correct id");
      var results = data.results;
      assert.strictEqual(Array.isArray(results), true, 'Correct result type');
      var row = results[0];
      assert.strictEqual(typeof row, 'object', 'Type of the returned row');
      assert.deepEqual(row.columns, ['num', 'str', 'hex'], 'Reading column names');
      assert.strictEqual(row.values[0][0], 1, 'Reading number');
      assert.strictEqual(row.values[0][1], 'a', 'Reading string');
      // Disabled because of our node worker library
      // assert.deepEqual(Array.from(row.values[0][2]), [0x00, 0x42], 'Reading BLOB');

      worker.onmessage = function(event) {
        var data = event.data;

        if (!data.finished) {
          data.row.hex = Array.from(data.row.hex);
          // assert.deepEqual(data.row, {num:1, str:'a', hex: [0x00, 0x42]}, "Read row from db.each callback");
        } else {
          worker.onmessage = function(event, a) {
            var data = event.data;
            buffer = []
            for(var p in data.buffer) {
              buffer += data.buffer[p]
            }
            assert.equal(typeof buffer.length, 'number', 'Export returns data');
            assert.notEqual(buffer.length, 0, 'Data returned is not empty');
            done();
          }
          worker.postMessage({action:'export'});
        }
      }
      worker.postMessage ({
        action: 'each',
        sql: 'SELECT * FROM test'
      })
    }
    var sqlstr = "CREATE TABLE test (num, str, hex);";
    sqlstr += "INSERT INTO test VALUES (1, 'a', x'0042');";
    sqlstr += "SELECT * FROM test;";
    worker.postMessage({
      id: 2,
      action: 'exec',
      sql: sqlstr
    });
  }
  worker.onerror = function (e) {
    // This doesn't appear to get thrown if there is an eval error in the worker
    console.log("Threw error: ", e);
    assert.fail(new Error(e),null,"Sould not throw an error");
    done();
  }
  worker.postMessage({id:1, action: 'open'});

  setTimeout(function ontimeout (){
    assert.fail(new Error("Worker should answer in less than 3 seconds"));
    done();
  }, 3000);
}

if (!Array.from) {
  Array.from = function(pseudoarray) {
    return Array.prototype.slice.call(pseudoarray);
  };
}

if (module == require.main) {
  var assert = require("assert");
  var done = function(){process.exit(0)};
  exports.test(null, assert, done);
}
