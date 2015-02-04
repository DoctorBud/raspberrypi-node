echo "" > sharedLog.txt
node server &> node1.log &
node server &> node2.log &
tail -f sharedLog.txt
