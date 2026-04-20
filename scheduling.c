#include <stdio.h>
#include <stdlib.h>
#include <pthread.h>

typedef struct {
  int id;
  int arrivalTime;
  int burstTime;
  int completionTime;
  int turnaroundTime;
  int waitingTime;
} Process;

typedef struct {
  Process *processes;
  int n;
} ThreadData;

/* sort by arrival time */
void sortProcesses(Process p[], int n) {
  for (int i = 0; i < n - 1; i++) {
    for (int j = 0; j < n - i - 1; j++) {
      if (p[j].arrivalTime > p[j + 1].arrivalTime) {
        Process temp = p[j];
        p[j] = p[j + 1];
        p[j + 1] = temp;
      }
    }
  }
}
/* sort by ID*/
void sortID(Process p[], int n) {
  for (int i = 0; i < n - 1; i++) {
    for (int j = 0; j < n - i - 1; j++) {
      if (p[j].id > p[j + 1].id) {
        Process temp = p[j];
        p[j] = p[j + 1];
        p[j + 1] = temp;
      }
    }
  }
}

/* required function */
void calculateTimes(Process p[], int n) {
  sortProcesses(p, n);

  int currentTime = 0;

  for (int i = 0; i < n; i++) {

    if (currentTime < p[i].arrivalTime)
      currentTime = p[i].arrivalTime;

    currentTime += p[i].burstTime;

    p[i].completionTime = currentTime;

    p[i].turnaroundTime =
      p[i].completionTime - p[i].arrivalTime;

    p[i].waitingTime =
      p[i].turnaroundTime - p[i].burstTime;
  }
  sortID(p, n);
}

/* thread function */
void *threadCalculate(void *arg) {
  ThreadData *data = (ThreadData *)arg;

  calculateTimes(data->processes, data->n);

  pthread_exit(NULL);
}

int main() {
  int n;
  pthread_t thread;
  ThreadData data;

  printf("Numero de procesos: ");
  scanf("%d", &n);

  Process *p = malloc(n * sizeof(Process));

  for (int i = 0; i < n; i++) {
    printf("\nProceso %d\n", i + 1);

    printf("ID: ");
    scanf("%d", &p[i].id);

    printf("Arrival Time: ");
    scanf("%d", &p[i].arrivalTime);

    printf("Burst Time: ");
    scanf("%d", &p[i].burstTime);

    p[i].completionTime = 0;
    p[i].turnaroundTime = 0;
    p[i].waitingTime = 0;
  }

  data.processes = p;
  data.n = n;

  pthread_create(&thread, NULL, threadCalculate, &data);
  pthread_join(thread, NULL);

  double avgTurnaround = 0.0;
  double avgWaiting = 0.0;


  printf("\n");
  printf("ID\tAT\tBT\tCT\tTAT\tWT\n");

  for (int i = 0; i < n; i++) {
    printf("%d\t%d\t%d\t%d\t%d\t%d\n",
           p[i].id,
           p[i].arrivalTime,
           p[i].burstTime,
           p[i].completionTime,
           p[i].turnaroundTime,
           p[i].waitingTime);

    avgTurnaround += p[i].turnaroundTime;
    avgWaiting += p[i].waitingTime;
  }

  avgTurnaround /= n;
  avgWaiting /= n;

  printf("\nPromedio Turnaround Time: %.2f\n", avgTurnaround);
  printf("Promedio Waiting Time: %.2f\n", avgWaiting);

  free(p);

  return 0;
}
