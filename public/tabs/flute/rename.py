import os

def rename_png_files():
    """Переименовывает PNG-файлы, делая первую букву заглавной"""
    current_folder = os.path.dirname(os.path.abspath(__file__))
    script_name = os.path.basename(__file__)
    
    renamed_count = 0
    for filename in os.listdir(current_folder):
        if filename.lower().endswith('.png') and filename != script_name:
            # Разделяем имя и расширение файла
            name, ext = os.path.splitext(filename)
            
            # Проверяем, что первая буква строчная
            if name and name[0].islower():
                # Делаем первую букву заглавной
                new_name = name[0].upper() + name[1:] + ext
                old_path = os.path.join(current_folder, filename)
                new_path = os.path.join(current_folder, new_name)
                
                # Переименовываем файл
                os.rename(old_path, new_path)
                print(f"Переименован: {filename} -> {new_name}")
                renamed_count += 1
            else:
                print(f"Пропущен: {filename} (первая буква уже заглавная или имя пустое)")
    
    if renamed_count > 0:
        print(f"Переименовано файлов: {renamed_count}")
    else:
        print("Файлы для переименования не найдены.")

if __name__ == "__main__":
    print("Начинаю переименование PNG-файлов...")
    rename_png_files()
    print("\nПереименование завершено!")
    input("Нажмите Enter для выхода...")