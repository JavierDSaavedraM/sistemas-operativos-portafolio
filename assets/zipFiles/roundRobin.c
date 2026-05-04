#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <windows.h>

#define MAX_PROCESOS 10
#define COLOR_DEFAULT    FOREGROUND_RED | FOREGROUND_GREEN | FOREGROUND_BLUE
#define COLOR_TITULO     FOREGROUND_GREEN | FOREGROUND_INTENSITY
#define COLOR_ACTIVO     FOREGROUND_GREEN | FOREGROUND_INTENSITY | BACKGROUND_GREEN >> 4
#define COLOR_COLA       FOREGROUND_BLUE  | FOREGROUND_INTENSITY
#define COLOR_TERMINADO  FOREGROUND_RED   | FOREGROUND_INTENSITY
#define COLOR_HEADER     FOREGROUND_RED   | FOREGROUND_GREEN | FOREGROUND_INTENSITY
#define COLOR_LOG        FOREGROUND_RED   | FOREGROUND_GREEN | FOREGROUND_BLUE
#define COLOR_RESALTADO  FOREGROUND_RED   | FOREGROUND_GREEN | FOREGROUND_INTENSITY

typedef struct {
  int  id;
  char nombre[16];
  int  burst_total;
  int  burst_restante;
  int  terminado;
} Proceso;

HANDLE hConsole;

void ir_a(int x, int y) {
  COORD pos = {(SHORT)x, (SHORT)y};
  SetConsoleCursorPosition(hConsole, pos);
}

void color(WORD attr) {
  SetConsoleTextAttribute(hConsole, attr);
}

void limpiar_pantalla() {
  CONSOLE_SCREEN_BUFFER_INFO csbi;
  DWORD count, written;
  COORD home = {0, 0};
  GetConsoleScreenBufferInfo(hConsole, &csbi);
  count = csbi.dwSize.X * csbi.dwSize.Y;
  FillConsoleOutputCharacter(hConsole, ' ', count, home, &written);
  FillConsoleOutputAttribute(hConsole, csbi.wAttributes, count, home, &written);
  SetConsoleCursorPosition(hConsole, home);
}

void ocultar_cursor() {
  CONSOLE_CURSOR_INFO ci = {1, FALSE};
  SetConsoleCursorInfo(hConsole, &ci);
}

void dibujar_borde(int x, int y, int ancho, int alto, WORD attr) {
  color(attr);
  ir_a(x, y);
  printf("+");
  for (int i = 0; i < ancho - 2; i++) printf("-");
  printf("+");
  for (int i = 1; i < alto - 1; i++) {
    ir_a(x, y + i);
    printf("|");
    ir_a(x + ancho - 1, y + i);
    printf("|");
  }
  ir_a(x, y + alto - 1);
  printf("+");
  for (int i = 0; i < ancho - 2; i++) printf("-");
  printf("+");
}

void dibujar_titulo() {
  color(COLOR_TITULO);
  ir_a(2, 0);
  printf("=== SIMULADOR ROUND ROBIN ===");
  color(COLOR_DEFAULT);
}

void dibujar_panel_cola(Proceso *procesos, int n, int fila_log) {
  // Marco de la cola
  dibujar_borde(0, 2, 50, 5, COLOR_COLA);
  color(COLOR_COLA);
  ir_a(2, 2);
  printf(" COLA DE LISTOS ");

  ir_a(1, 3);
  color(COLOR_DEFAULT);
  // Imprimir cada proceso en la cola
  int col = 2;
  for (int i = 0; i < n; i++) {
    ir_a(col, 4);
    if (procesos[i].terminado) {
      color(COLOR_TERMINADO);
      printf("[%-4s DONE]", procesos[i].nombre);
    } else {
      color(COLOR_COLA);
      printf("[%-4s t=%-2d]", procesos[i].nombre, procesos[i].burst_restante);
    }
    col += 12;
  }
}

void dibujar_panel_ejecucion(const char *nombre_proceso, int burst_restante, int burst_total, int quantum) {
  dibujar_borde(0, 8, 50, 7, COLOR_RESALTADO);
  color(COLOR_RESALTADO);
  ir_a(2, 8);
  printf(" EN EJECUCION ");

  color(COLOR_HEADER);
  ir_a(3, 10);
  printf("Proceso  : ");
  color(FOREGROUND_GREEN | FOREGROUND_INTENSITY);
  printf("%-10s", nombre_proceso);

  color(COLOR_HEADER);
  ir_a(3, 11);
  printf("Restante : ");
  color(FOREGROUND_RED | FOREGROUND_INTENSITY);
  printf("%-4d unidades", burst_restante);

  color(COLOR_HEADER);
  ir_a(3, 12);
  printf("Quantum  : ");
  color(COLOR_DEFAULT);
  printf("%-4d", quantum);

  // Barra de progreso
  ir_a(3, 13);
  color(COLOR_HEADER);
  printf("Progreso : [");
  int total_barras = 30;
  int barras_hechas = (burst_total > 0)
    ? (int)(((float)(burst_total - burst_restante) / burst_total) * total_barras)
    : total_barras;
  color(FOREGROUND_GREEN | FOREGROUND_INTENSITY);
  for (int i = 0; i < barras_hechas; i++) printf("#");
  color(FOREGROUND_RED | FOREGROUND_INTENSITY);
  for (int i = barras_hechas; i < total_barras; i++) printf(".");
  color(COLOR_HEADER);
  printf("] %3d%%", (burst_total > 0)
         ? (int)(((float)(burst_total - burst_restante) / burst_total) * 100)
         : 100);
}

void limpiar_panel_ejecucion() {
  for (int y = 8; y <= 15; y++) {
    ir_a(0, y);
    printf("                                                  ");
  }
}

void agregar_log(int fila, const char *msg, WORD attr) {
  ir_a(0, fila);
  // limpiar linea
  printf("                                                  ");
  ir_a(0, fila);
  color(attr);
  printf("%s", msg);
  color(COLOR_DEFAULT);
}

int main() {
  hConsole = GetStdHandle(STD_OUTPUT_HANDLE);
  ocultar_cursor();
  limpiar_pantalla();

  int n, quantum;
  Proceso procesos[MAX_PROCESOS];

  // --- Entrada de datos ---
  color(COLOR_TITULO);
  printf("\n  === ROUND ROBIN - CONFIGURACION ===\n\n");
  color(COLOR_DEFAULT);

  printf("  Numero de procesos (max %d): ", MAX_PROCESOS);
  scanf("%d", &n);
  if (n < 1 || n > MAX_PROCESOS) {
    printf("  Numero invalido.\n");
    return 1;
  }

  printf("  Quantum: ");
  scanf("%d", &quantum);
  if (quantum < 1) {
    printf("  Quantum invalido.\n");
    return 1;
  }

  for (int i = 0; i < n; i++) {
    procesos[i].id = i + 1;
    sprintf(procesos[i].nombre, "P%d", i + 1);
    procesos[i].terminado = 0;
    printf("  Burst de %s: ", procesos[i].nombre);
    scanf("%d", &procesos[i].burst_total);
    procesos[i].burst_restante = procesos[i].burst_total;
  }

  limpiar_pantalla();

  // --- Simulacion ---
  int ronda = 0;
  int procesos_terminados = 0;
  int fila_log = 17;
  int max_log_filas = 10;
  char log_msgs[20][80];
  WORD  log_attrs[20];
  int   log_count = 0;

  dibujar_titulo();

  while (procesos_terminados < n) {
    for (int i = 0; i < n; i++) {
      if (procesos[i].terminado) continue;

      ronda++;
      int ejecutado = (procesos[i].burst_restante > quantum)
        ? quantum
        : procesos[i].burst_restante;
      procesos[i].burst_restante -= ejecutado;

      // Dibujar cola actualizada
      dibujar_panel_cola(procesos, n, fila_log);

      // Dibujar panel de ejecucion
      limpiar_panel_ejecucion();
      dibujar_panel_ejecucion(
        procesos[i].nombre,
        procesos[i].burst_restante,
        procesos[i].burst_total,
        ejecutado
      );

      // Log
      char msg[80];
      if (procesos[i].burst_restante == 0) {
        procesos[i].terminado = 1;
        procesos_terminados++;
        sprintf(msg, "  Ronda %2d | %-4s ejecuto %d ut -> TERMINADO",
                ronda, procesos[i].nombre, ejecutado);
        if (log_count < 20) {
          strcpy(log_msgs[log_count], msg);
          log_attrs[log_count] = COLOR_TERMINADO;
          log_count++;
        }
      } else {
        sprintf(msg, "  Ronda %2d | %-4s ejecuto %d ut -> restante: %d",
                ronda, procesos[i].nombre, ejecutado, procesos[i].burst_restante);
        if (log_count < 20) {
          strcpy(log_msgs[log_count], msg);
          log_attrs[log_count] = COLOR_LOG;
          log_count++;
        }
      }

      // Imprimir log (ultimas filas disponibles)
      int inicio = (log_count > max_log_filas) ? log_count - max_log_filas : 0;
      for (int j = inicio; j < log_count; j++) {
        agregar_log(fila_log + (j - inicio), log_msgs[j], log_attrs[j]);
      }

      Sleep(800);
    }
  }

  // Mensaje final
  limpiar_panel_ejecucion();
  dibujar_borde(0, 8, 50, 4, FOREGROUND_GREEN | FOREGROUND_INTENSITY);
  color(FOREGROUND_GREEN | FOREGROUND_INTENSITY);
  ir_a(10, 10);
  printf(">>> TODOS LOS PROCESOS COMPLETADOS <<<");
  ir_a(10, 11);
  printf("    Total de rondas: %d", ronda);

  ir_a(0, fila_log + max_log_filas + 1);
  color(COLOR_DEFAULT);
  printf("\n  Presiona ENTER para salir...");
  getchar(); getchar();

  limpiar_pantalla();
  color(COLOR_DEFAULT);
  return 0;
}
