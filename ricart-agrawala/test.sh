echo "" > sharedLog.txt
node server &> node1.log &
node server &> node2.log &
node server &> node3.log &
node server &> node4.log &
tail -f sharedLog.txt
