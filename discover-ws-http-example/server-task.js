var taskState = '';
var taskCounter = 0;
var taskWS = null;

function task() {
  taskState += 'X';
  taskCounter++;

  if (taskWS) {
    taskWS.send(JSON.stringify(
      {
        msgType: 'task',
        taskState: taskState,
        taskCounter: taskCounter
      }));
    myTimer = setTimeout(function () {task();}, 5000);
  }
  else {
    console.log('unable to send. taskWS closed');
  }
}

function startTask(ws) {
  taskWS = ws;
  task();
}

function stopTask() {
  clearTimeout(myTimer);
  myTimer = null;
}

exports.startTask = startTask;
exports.stopTask = stopTask;